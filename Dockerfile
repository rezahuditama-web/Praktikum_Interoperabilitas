# FROM node:20

# WORKDIR /app

# COPY package*.json ./

# RUN npm install

# COPY . .

# EXPOSE 3000

# CMD ["node", "app/server.js"]


FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "app/konsistensi.js"]