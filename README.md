test containerized with lightweight AI autobuy/sell

note: build in progress
-----
## Installation: *Ignore. In progress*
----
Step 1
install ubuntu 22.04 from microsoft store
install this repo

Step 2
wsl --install
wsl --set-default-version 2
powershell -Command "Invoke-WebRequest -Uri 'https://desktop.docker.com/win/stable/Docker%20Desktop%20Installer.exe' -OutFile 'DockerDesktopInstaller.exe'".
powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v18.20.4/node-v18.20.4-x64.msi' -OutFile 'nodejs.msi'".
node --version
npm --version
docker --version
wsl -d docker-desktop

step 3
cd <path_to_repo_location>
docker build -t <container_id> .
docker run --env-file .env <container_id> 


---
### Debug:
##### stop, remove and rebuild
docker stop <container_id>
docker rm <container_id>
docker build -t <container_id> .
docker run --env-file .env <container_id>
