


## OpenStreetMap cloud installation guide

#### Source documents:
#### https://overpass-api.de/full_installation.html
#### https://wiki.openstreetmap.org/wiki/Overpass_API/Installation#Setting_up_the_Web_API

#### Create ec2 instance, I used t2.xlarge with a 500GB drive

#### Create/use and existing public/private key .pem file from EC2, and download it to your local ~/.ssh directory or similar

#### Connect with ssh, using the instance name and public url

# Create local public key (if needed) and it to the server
# local~$ ssh-keygen
# (accept the defaults)
# copy the text from the console
# local~$ cat ~/.ssh/id_rsa.pub
# log into the server
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

wget http://dev.overpass-api.de/releases/osm-3s_v[0.7.55.7].tar.gz

#### Gunzip

gunzip <osm-3s_v[0.7.55.7].tar.gz | tar xvf -

### Install

put the following in ~/.bashrc:

export EXEC_DIR=osm-3s_v[0.7.55]/

export DB_DIR="$EXEC_DIR/db"

export REPLICATE_DIR="$EXEC_DIR/replications"

mkdir ~/src

mv osm-3s_v[0.7.55]/ src

cd $EXEC_DIR

./configure --prefix="`pwd`"

make

bash ./bin/download_clone.sh --db-dir=db --source=http://dev.overpass-api.de/api_drolbr/ --meta=yes

#### (Go eat lunch, take a nap, etc--takes a few hours)

#### Make sure all the cgi files are executable

bash chmod 755 cgi-bin/*

#### Start process to get diffs

chmod 666 db/osm3s_v0.7.55_osm_base

chmod 755 bin/fetch_osc.sh

chmod 755 bin/apply_osc_to_db.sh

### Start the dispatcher

nohup $EXEC_DIR/bin/dispatcher --osm-base --meta --db-dir=$DB_DIR &

# If you have problems because of a previous run, delete the following marker files
# rm -f /dev/shm/osm3s_v0.7.55_osm_base
# rm -f $DB_DATA/osm3s_v0.7.55_osm_base

nohup $EXEC_DIR/bin/fetch_osc.sh id "https://planet.osm.org/replication/day/" "diffs/" &

nohup $EXEC_DIR/bin/apply_osc_to_db.sh "diffs/" auto --meta=yes &


### Install nginx

(the following is not in the docs, which uses apache)

# Create an environmental variable $OSM_SERVER=[server name] for your eventual server name
# (you'll set up https below)

sudo apt install nginx

sudo apt-get install python-software-properties software-properties-common
sudo LC_ALL=C.UTF-8 add-apt-repository ppa:ondrej/php
sudo apt-get update
sudo apt-get install php7.0 php7.0-fpm php7.0-mysql -y
sudo apt-get --purge autoremove -y
sudo systemctl restart nginx
sudo systemctl restart php7.0-fpm

#### Setup the base conf fileG

cd /etc/nginx

#### The default one is useless.
sudo mv nginx.conf nginx.conf.original
#### Move the one from rescape-osm into place
sudo mv ~/nginx.conf /etc/nginx/nginx.conf

#### Open port 80 and 443 (HTTPS) on the EC2 instance: https://stackoverflow.com/questions/5004159/opening-port-80-ec2-amazon-web-services

On the EC2 website, go to Network & Security -> Security Groups. Choose the security group of the instance and add port 80 to inbound rules

#### Restart and  Check the status

systemctl rereload

systemctl status nginx

### Set up OSM areas

cd $BASE_DIR
cp -pR "rules" $DB_DIR

# This takes about 30 hours to complete
nohup $EXEC_DIR/bin/dispatcher --areas --db-dir=$DB_DIR &
# If you have problems because of a previous run, delete the following marker files
# rm -f /dev/shm/osm3s_v0.7.55_osm_areas
# rm -f $DB_DATA/osm3s_v0.7.55_osm_areas

chmod 666 db/osm3s_v0.7.55_areas
chmod 755 bin/rules_loop.sh
# Something is wrong with the paths in this script. Comment out the DB_DIR=... line. We already have it defined
nohup $EXEC_DIR/bin/rules_loop.sh $DB_DIR &

#### Nice the process to be less important:

ps -ef | grep rules

Take the task and run
renice -n 19 -p PID
ionice -c 2 -n 7 -p PID

### Environmental variables ###
# Figure out a dns entry that can point to the server. You need a domain name so you can setup https
# Create an environmental variable $OSM_SERVER=[server name]
# Create an environmental variable $OSM_SERVERS='https://[server name]/api/interpreter'

#### Setup a certificate

https://certbot.eff.org/lets-encrypt/ubuntuxenial-nginx

# More info
https://certbot.eff.org/docs/using.html?highlight=nginx#nginx

sudo apt-get update
sudo apt-get install software-properties-common
sudo add-apt-repository universe
sudo add-apt-repository ppa:certbot/certbot
sudo apt-get update
sudo apt install certbot
sudo apt-get install certbot python-certbot-nginx

# Note that a crontab job is automatically created to renew twice daily:
# /etc/cron.d/certbot
# To add subdomains to the certificate, do this:

wget https://dl.eff.org/certbot-auto

# E.g. to add sop_os_1.stateofplace.co when sop_os_0.stateofplace.co is already present

chmod a+x ./certbot-auto

./certbot-auto --cert-name sop_os_1.stateofplace.co -d sop_os_0.stateofplace.co -d sop_os_1.stateofplace.co

I can't get the above to work--meaning I don't know how to have a single server work on multiple subdomains
when another server has one of the subdomains. The best thing seems to be to list all subdomains in the nginx
config and then run
sudo certbot --nginx

This asks which subdomain to use and updates /etc/nginx/sites-enabled/sop to point to the security certificate


# Extras

# To start all the scripts at once
nohup $EXEC_DIR/bin/dispatcher --osm-base --meta --db-dir=$DB_DIR &
nohup $EXEC_DIR/bin/fetch_osc.sh id "https://planet.osm.org/replication/day/" "diffs/" &
nohup $EXEC_DIR/bin/apply_osc_to_db.sh "diffs/" auto --meta=yes &
nohup $EXEC_DIR/bin/dispatcher --areas --db-dir=$DB_DIR &
nohup $EXEC_DIR/bin/rules_loop.sh $DB_DIR &

# To kill the dispatchers
$EXEC_DIR/bin/dispatcher --osm_base --terminate
$EXEC_DIR/bin/dispatcher --areas --terminate

# If you need to increase the size of the volume on EC2:
https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/recognize-expanded-volume-linux.html
