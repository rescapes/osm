# The remote server to deploy too
# local~$ export $OSM_SERVER = domain name or ip

# Copy files to the server

# local~$ scp -i ~/.ssh/[SoP_osm_0].pem  <sop-vml base directory>/server/osm_setup.sh  $OSM_SERVER:/~osm_setup.sh

# local~$ scp -i ~/.ssh/[SoP_osm_0].pem  <sop-vml base directory>/server/nginx/nginx.conf  $OSM_SERVER:/tmp/nginx.conf
# sudo mv /tmp/nginx.conf /etc/nginx/nginx.conf

# Also get the start_osm.py script to use to startup the osm scripts as a service
# local~$ scp -i ~/.ssh/[SoP_osm_0].pem  <sop-vml base directory>/server/osm_setup.sh  $OSM_SERVER:~/osm_setup.sh


## OpenStreetMap cloud installation guide

#### Source documents:
#### https://overpass-api.de/full_installation.html
#### https://wiki.openstreetmap.org/wiki/Overpass_API/Installation#Setting_up_the_Web_API

#### Create ec2 instance, I used t2.xlarge with 250GB drive

#### Create/use and existing public/private key .pem file from EC2, and download it to your local ~/.ssh directory or similar

#### Connect with ssh, using the instance name and public url

# local~$ ssh -i ~/.ssh/[SoP_osm_0].pem $server

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

(Go eat lunch, take a nap, etc--takes a few hours)

Make sure all the cgi files are executable

bash chmod 755 cgi-bin/*

#### Start process to get diffs

chmod 666 db/osm3s_v0.7.55_osm_base

chmod 755 bin/fetch_osc.sh

chmod 755 bin/apply_osc_to_db.sh

nohup bin/dispatcher --osm-base --meta --db-dir=$DB_DIR &

nohup bin/fetch_osc.sh id " https://planet.osm.org/replication/day/" "diffs/" &

nohup bin/apply_osc_to_db.sh "diffs/" auto --meta=yes &

### Start the dispatcher

nohup $EXEC_DIR/bin/dispatcher --osm-base --db-dir=$DB_DIR --meta

### Install nginx

(the following is not in the docs, which uses apache)

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

#### Open port 80 and 443 (HTTPS) on the EC2 instance: https://stackoverflow.com/questions/5004159/opening-port-80-ec2-amazon-web-services

On the EC2 website, go to Network & Security -> Security Groups. Choose the security group of the instance and add port 80 to inbound rules

#### Restart and  Check the status

systemctl rereload

systemctl status nginx

### Set up OSM areas

cd $BASE_DIR
cp -pR "rules" $DB_DIR
nohup $EXEC_DIR/bin/dispatcher --areas --db-dir=$DB_DIR &
chmod 666 db/osm3s_v0.7.55_areas
chmod 755 bin/rules_loop.sh
nohup $EXEC_DIR/bin/rules_loop.sh $DB_DIR &

#### Nice the process to be less important:

ps -ef | grep rules

Take the task and run
renice -n 19 -p PID
ionice -c 2 -n 7 -p PID

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


