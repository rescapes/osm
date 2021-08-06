Resources for installing and running an Overpass server on the
cloud (or a local ubuntu instance)

This library uses memcached to cache OSM queries. On OSX, install memcached
brew install memcached
To run: 
brew services start memcached
To run without background service:
/usr/local/opt/memcached/bin/memcached -l localhost
To edit the config:
% ln -sfv /usr/local/opt/memcached/*.plist ~/Library/LaunchAgents
outputs: ~/Library/LaunchAgents/homebrew.mxcl.memcached.plist -> /usr/local/opt/memcached/homebrew.mxcl.memcached.plist
% vi /usr/local/opt/memcached/*.plist
To increase the memory, add the option. E.g.
<array>
<string>/usr/local/opt/memcached/bin/memcached</string>
<string>-l</string>
<string>localhost</string>
<string>-m</string>
<string>2000</string>
</array>

Then run to update TODO this doesn't work. Permissions problems
launchctl load ~/Library/LaunchAgents/homebrew.mxcl.memcached.plist


