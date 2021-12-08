


## OpenStreetMap cloud installation guide

#### Source documents:
#### https://overpass-api.de/full_installation.html
#### https://wiki.openstreetmap.org/wiki/Overpass_API/Installation#Setting_up_the_Web_API
#### Technial overview: http://overpass-api.de/technical_overview.html

#### Create ec2 instance, I used t2.xlarge with a 500GB drive

#### Create/use and existing public/private key .pem file from EC2, and download it to your local ~/.ssh directory or similar

#### Connect with ssh, using the instance name and public url

# Create local public key (if needed) and it to the server
# local~$ ssh-keygen
# (accept the defaults)
# copy the text from the console
# local~$ cat ~/.ssh/id_rsa.pub
# og into the server
# local~$ ssh -i ~/.ssh/SoP_osm.pem $server
# remote~$ vi ~/.ssh/authorized_keys (paste the public key in here)

# Copy local files to the server
# local~$ scp server/init.d/overpass ubuntu@$server:~
# remote~$ sudo mv ~/overpass /etc/init.d
# remote~$ sudo chown root:root /etc/init.d/overpass
# local~$ scp server/nginx/nginx.conf ubuntu@$server:~

# Now you can ssh easier:
# local~$ ssh ubuntu@$server

# Once connected, run this script on the server

# Install required libs (expat doesn't seem to exist anymore, so omitting)

sudo apt-get install g++ make  libexpat1-dev zlib1g-dev

#### Download the latest install file

wget http://dev.overpass-api.de/releases/osm-3s_v0.7.55.7.tar.gz

#### Gunzip

gunzip <osm-3s_v0.7.55.7.tar.gz | tar xvf -

### Install

put the following in ~/.bashrc:

export BASE_OSM_DIR=~/src/osm-3s_v0.7.55
export EXEC_DIR=$BASE_OSM_DIR/bin
export DB_DIR="$BASE_OSM_DIR/db"
export DIFF_DIR="$BASE_OSM_DIR/diffs"
export OSM_SERVER='YOURSERVERHOSTNAME'
export NOMINATIM_USERNAME=nominatim
export NOMINATIM_USERHOME=/srv/nominatim

export REPLICATE_DIR="$DB_DIR/replications"

source ~/.bashrc

mkdir ~/src


cd src/osm-3s_v0.7.55/
./configure CXXFLAGS="-O2"  --prefix="`pwd`"
make install

bash ./bin/download_clone.sh --db-dir=db --source=http://dev.overpass-api.de/api_drolbr/ --meta=yes

#### (Go eat lunch, take a nap, etc--takes a few hours)

#### Make sure all the cgi files are executable

chmod 755 cgi-bin/*

#### Start process to get diffs

chmod 666 db/osm3s_v0.7.55_osm_base

chmod 755 bin/fetch_osc.sh

chmod 755 bin/apply_osc_to_db.sh

### Start the dispatcher

nohup $EXEC_DIR/dispatcher --osm-base --meta --db-dir=$DB_DIR &

# If you have problems because of a previous run, delete the following marker files
# rm -f /dev/shm/osm3s_v0.7.55_osm_base
# rm -f $DB_DIR/osm3s_v0.7.55_osm_base

nohup $EXEC_DIR/fetch_osc.sh id "https://planet.osm.org/replication/day/" "diffs/" &

nohup $EXEC_DIR/apply_osc_to_db.sh "diffs/" auto --meta=yes &


### Install nginx

(the following is not in the docs, which uses apache)

# Create an environmental variable $OSM_SERVER=[server name] for your eventual server name
# (you'll set up https below)

sudo apt install nginx
sudo apt install fcgiwrap
sudo systemctl enable nginx
sudo systemctl enable fcgiwrap

sudo apt-get install python-software-properties software-properties-common
sudo LC_ALL=C.UTF-8 add-apt-repository ppa:ondrej/php
sudo apt-get update
# TODO what is fpm for, apache?
sudo apt-get install php7.0 php7.0-fpm php7.0-mysql -y
sudo systemctl restart nginx
sudo systemctl restart fcgiwrap


# Get rescape-osm so we can get its nginx.conf
# generate ~/.ssh/id_rsa.pub, copy the file contents to your github ssh keys
sshkeygen
mkdir rescape
cd rescape
git clone git@github.com:calocan/rescape-osm.git
# Get the latest if changes were made since the clone
git pull
# Symlink the nginx.conf
sudo ln -s /home/ubuntu/src/rescape/rescape-osm/server/nginx/nginx.conf /etc/nginx/sites-available/overpass.conf
sudo ln -s /etc/nginx/sites-available/overpass.conf /etc/nginx/sites-enabled/overpass.conf

sudo mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.original
sudo cp server/nginx/nginx.conf /etc/nginx/
# Edit /etc/nngix/nginx.conf in 2 places to contain the correct dns name at server name e.g.
    server_name osm1.rescapes.net;


cd /etc/nginx

#### Open port 80 and 443 (HTTPS) on the EC2 instance: https://stackoverflow.com/questions/5004159/opening-port-80-ec2-amazon-web-services

# On the EC2 website, go to Network & Security -> Security Groups. Choose the security group of the instance and add port 80 to inbound rules

#### Restart and  Check the status

sudo systemctl reload nginx

sudo systemctl status nginx

### Set up OSM areas

cd $BASE_DIR
cp -pR "rules" $DB_DIR

# This takes about 30 hours to complete
nohup $EXEC_DIR/dispatcher --areas --db-dir=$DB_DIR &
# If you have problems because of a previous run, delete the following marker files
# rm -f /dev/shm/osm3s_v0.7.55_osm_areas
# rm -f $DB_DIR/osm3s_v0.7.55_osm_areas

chmod 666 db/osm3s_v0.7.55_areas
chmod 755 bin/rules_loop.sh
# Something is wrong with the paths in this script. Comment out the DB_DIR=... line. We already have it defined
nohup $EXEC_DIR/rules_loop.sh $DB_DIR &

#### Nice the process to be less important:

ps -ef | grep rules

# Take the task and run
renice -n 19 -p $(pgrep -f rules_loop.sh)
ionice -c 2 -n 7 -p $(pgrep -f rules_loop.sh)

### Environmental variables ###
# Figure out a dns entry that can point to the server. You need a domain name so you can setup https
# Create an environmental variable $OSM_SERVER=[server name]
# Create an environmental variable $OSM_SERVERS='https://[server name]/api/interpreter'

#### Setup a certificate

# Certbot ssl certificate
sudo snap install core
sudo snap refresh core
sudo snap remove certbot
sudo snap install --classic certbot
# This asks which subdomain to use and updates /etc/nginx/sites-enabled/sop to point to the security certificate
sudo certbot --nginx

# Reboot script. Copy from rescape-osm
~local: scp server/sop_reboot.sh ubuntu@SERVER_NAME:~/src/osm-3s_v0.7.55/bin

# On the server make a log dir
chmod 755  ~/osm-3s_v0.7.55/bin/sop_reboot.sh
sudo mkdir -p /var/log/overpass
sudo chown ubuntu:ubuntu /var/log/overpass
sudo chmod -R 755 /var/log/overpass

crontab -e
# Paste the following in the crontab file
@reboot nohup /home/ubuntu/src/osm-3s_v0.7.55/bin/sop_reboot.sh
# Edit the cron config to log somewhere useful: /var/log/cron.log
vi sudo /etc/rsyslog.d/50-default.conf
# Find the line that starts with and uncomment
#cron.*
sudo service rsyslog restart


# To kill the dispatchers manually
$EXEC_DIR/dispatcher --osm-base --terminate
# If you have problems because of a previous run, delete the following marker files
rm -f  /dev/shm/osm3s_v0.7.55_osm_base
rm -f $DB_DIR/osm3s_v0.7.55_osm_base
# Area dispatcher
$EXEC_DIR/dispatcher --areas --terminate
rm -f $DB_DIR/osm3s_v0.7.55_areas
# To start all the scripts at once
# The dispatcher has been successfully started if you find a line "Dispatcher just started." in the file transactions.log in the database directory with correct date (in UTC).
sudo pkill -f fetch_osc
sudo pkill -f rules_loop
sudo pkill -f apply_osc_to_db
sudo pkill -f update_from_dir
sudo pkill -f './osm3s_query --progress --rules'
# Manual commands (same as $EXEC_DIR/sop_reboot.sh commands)
nohup $EXEC_DIR/dispatcher --osm-base --meta --db-dir=$DB_DIR >>/var/log/overpass/dispatcher-base.out &
nohup $EXEC_DIR/dispatcher --areas --db-dir=$DB_DIR >>/var/log/overpass/dispatcher-areas.out &
nohup $EXEC_DIR/fetch_osc.sh id "https://planet.osm.org/replication/day/" "diffs/" >>/var/log/overpass/fetch_osc.out&
nohup $EXEC_DIR/apply_osc_to_db.sh "diffs/" auto --meta=yes >>/var/log/overpass/apply_osc_to_db.out&
nohup $EXEC_DIR/rules_loop.sh $DB_DIR >>/var/log/overpass/rules_loop.out&
# TODO This rules_loop isn't in reboot.sh. Do I need it?

# To test the server quickly
# official server
curl "https://overpass-api.de/api/interpreter?data=%3Cprint%20mode=%22body%22/%3E"
# your server (limit $OSM_SERVERS to 1 server comma-separated)
curl "$OSM_SERVERS/api/interpreter?data=%3Cprint%20mode=%22body%22/%3E"
# or to see results
# If the dispatcher isn't working, terminate it and test the installation vi the bin command:
curl "$OSM_SERVERS/cgi-bin/interpreter?data=%3Cosm-script%20output%3D%22json%22%20output-config%3D%22%22%3E%0A%20%20%3Cid-query%20type%3D%22node%22%20ref%3D%2253049873%22%20into%3D%22matchingNode%22%2F%3E%0A%20%20%3Cquery%20into%3D%22matchingWays%22%20type%3D%22way%22%3E%0A%20%20%20%20%3Chas-kv%20k%3D%22highway%22%20modv%3D%22%22%20v%3D%22%22%2F%3E%0A%20%20%20%20%3Chas-kv%20k%3D%22highway%22%20modv%3D%22not%22%20v%3D%22driveway%22%2F%3E%0A%20%20%20%20%3Chas-kv%20k%3D%22footway%22%20modv%3D%22not%22%20v%3D%22crossing%22%2F%3E%0A%20%20%20%20%3Chas-kv%20k%3D%22footway%22%20modv%3D%22not%22%20v%3D%22sidewalk%22%2F%3E%0A%20%20%20%20%3Crecurse%20from%3D%22matchingNode%22%20type%3D%22node-way%22%2F%3E%0A%20%20%3C%2Fquery%3E%0A%20%20%3Cprint%20e%3D%22%22%20from%3D%22matchingWays%22%20geometry%3D%22full%22%20ids%3D%22yes%22%20limit%3D%22%22%20mode%3D%22body%22%20n%3D%22%22%20order%3D%22id%22%20s%3D%22%22%20w%3D%22%22%2F%3E%0A%3C%2Fosm-script%3E"
$EXEC_DIR/osm3s_query --db-dir=$DB_DIR
[timeout:900][maxsize:1073741824][out:json];way(area:3608398123)["area" != "yes"][highway]["building" != "yes"]["highway" != "elevator"]["highway" != "driveway"]["highway" != "cycleway"]["highway" != "steps"]["highway" != "proposed"]["footway" != "crossing"]["footway" != "sidewalk"]["service" != "parking_aisle"]["service" != "driveway"]["service" != "drive-through"](if: t["highway"] != "service" || t["access"] != "private")(if: t["highway"] != "footway" || t["indoor"] != "yes") -> .allWays;
way.allWays["name" = "Chambers Street"] -> .ways;
(.allWays; - .ways;) -> .otherWays;
node(w.ways)(w.otherWays) -> .nodes;
.nodes out geom;
paste: <query type="node"><bbox-query n="51.0" s="50.9" w="6.9" e="7.0"/><has-kv k="amenity" v="pub"/></query><print/>
CTRL+D

# If you need to increase the size of the volume on EC2:
https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/recognize-expanded-volume-linux.html

# Start/Stop the server instructions
https://aws.amazon.com/premiumsupport/knowledge-center/start-stop-lambda-cloudwatch/


# Nomanatim installation
# http://nominatim.org/release-docs/latest/appendix/Install-on-Ubuntu-18/
sudo apt-get update -qq
sudo apt-get install -y build-essential cmake g++ libboost-dev libboost-system-dev \
                        libboost-filesystem-dev libexpat1-dev zlib1g-dev libxml2-dev \
                        libbz2-dev libpq-dev libproj-dev \
                        postgresql-server-dev-10 postgresql-10-postgis-2.4 \
                        postgresql-contrib-10 postgresql-10-postgis-scripts \
                        apache2 php php-pgsql libapache2-mod-php \
                        php-intl git
# Create a dedicated user
sudo useradd -d /srv/nominatim -s /bin/bash -m nominatim
printf '\n%s\n%s' 'export NOMINATIM_USERNAME=nominatim' 'export NOMINATIM_USERHOME=/srv/nominatim' >> ~/.bashrc
sudo chmod a+x $NOMINATIM_USERHOME

# Postgres config for nominatim
sudo -u postgres createuser -s $NOMINATIM_USERNAME
sudo -u postgres createuser www-data

# Apache setup for nominatim
sudo tee /etc/php/7.4/fpm/pool.d/www.conf << EOF_PHP_FPM_CONF
[www]
; Comment out the tcp listener and add the unix socket
;listen = 127.0.0.1:9000
listen = /var/run/php7.2-fpm.sock
; Ensure that the daemon runs as the correct user
listen.owner = www-data
listen.group = www-data
listen.mode = 0666
; Unix user of FPM processes
user = www-data
group = www-data
; Choose process manager type (static, dynamic, ondemand)
pm = ondemand
pm.max_children = 5
EOF_PHP_FPM_CONF

# The following needs to be done as the new user.
sudo su nominatim
cd $NOMINATIM_USERHOME
wget https://nominatim.org/release/Nominatim-3.4.0.tar.bz2
tar xf Nominatim-3.4.0.tar.bz2
cd Nominatim-3.4.0
mkdir build
cd build
cmake $NOMINATIM_USERHOME/Nominatim-3.4.0
make
# You need to create a minimal configuration file that tells nominatim where it is located on the webserver:
tee settings/local.php << EOF
<?php
 @define('CONST_Website_BaseURL', '/nominatim/');
EOF

# Alternative Nginx for nomanatim. Add the following to /etc/nginx/nginx.conf
# TODO this doesn't work, but would with some tweeks
        locationWithNominatimData /nomanatim/ {
          root /srv/nominatim/build/website;
          try_files \$uri \$uri/ @php;
        }
        locationWithNominatimData @php {
            fastcgi_param SCRIPT_FILENAME "\$document_root\$uri.php";
            fastcgi_param PATH_TRANSLATED "\$document_root\$uri.php";
            fastcgi_param QUERY_STRING    \$args;
            fastcgi_pass unix:/var/run/php/php7.2-fpm.sock;
            fastcgi_index index.php;
            include fastcgi_params;
        }
        locationWithNominatimData ~ [^/]\.php(/|$) {
            fastcgi_split_path_info ^(.+?\.php)(/.*)$;
            if (!-f \$document_root\$fastcgi_script_name) {
                return 404;
            }
            fastcgi_pass unix:/var/run/php/php7.2-fpm.sock;
            fastcgi_index search.php;
            include fastcgi.conf;
        }