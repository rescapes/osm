# rescape-osm

# OpenStreetMap utilties

# Export the comma-separated urls of the servers you wish to use for openstreetmap/overpass
export OSM_SERVERS='https://lz4.overpass-api.de/api/interpreter, https://mytrustyosm.com/api/interpreter'

Run a graphql server at 127.0.0.1:8000 with a user setup with these credentials:
{username: "test", password: "testpass"}

With Django:
manage.py createsuperuser