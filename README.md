test containerized with lightweight AI autobuy/sell

note: build in progress
-----
## Installation:
----
### step 1: install apps

install docker desktop
install node.js

### step 2: install repo

install this repo and edit all .env files

### step 3: build and run container

'''
docker build -t <containername> .
docker run --env-file .env <continername>
