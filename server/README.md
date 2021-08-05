Resources for installing and running an Overpass server on the
cloud (or a local ubuntu instance)

This library uses memcached to cache OSM queries. On OSX, install memcached
brew install memcached
To run: 
brew services start memcached
To run without background service:
/usr/local/opt/memcached/bin/memcached -l localhost

