Resources for installing and running an Overpass server on the
cloud (or a local ubuntu instance)

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



