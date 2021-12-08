Resources for installing and running an Overpass server on the
cloud (or a local ubuntu instance)

#OSX
This library uses memcached to cache OSM queries. On OSX, install memcached
brew update
brew install redis

# Create storage dir (https://stackoverflow.com/questions/42857551/could-not-connect-to-redis-at-127-0-0-16379-connection-refused-with-homebrew)
mkdir -p /usr/local/var/db/redis
To have launchd start redis now and restart/stop
brew services start redis
brew services stop redis
Launch Redis on computer starts.
ln -sfv /usr/local/opt/redis/*.plist ~/Library/LaunchAgents
Test:
redis-cli ping

#Ubuntu 
sudo apt update
sudo apt install redis-server
sudo vi /etc/redis/redis.conf

# set systemd: 
# If you run Redis from upstart or systemd, Redis can interact with your
# supervision tree. Options:
#   supervised no      - no supervision interaction
#   supervised upstart - signal upstart by putting Redis into SIGSTOP mode
#   supervised systemd - signal systemd by writing READY=1 to $NOTIFY_SOCKET
#   supervised auto    - detect upstart or systemd method based on
#                        UPSTART_JOB or NOTIFY_SOCKET environment variables
# Note: these supervision methods only signal "process is ready."
#       They do not enable continuous liveness pings back to your supervisor.
supervised systemd

#Then
sudo systemctl restart redis.service
