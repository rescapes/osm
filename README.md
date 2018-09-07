# rescape-apollo

Apollo utilities for Rescape projects

This library runs tests against a graphql server. Thus you must add the following username and password to
server in order for tests to pass:

Run a graphql server at 127.0.0.1:8000 with a user setup with these credentials:
{username: "test", password: "testpass"}

With Django:
manage.py createsuperuser