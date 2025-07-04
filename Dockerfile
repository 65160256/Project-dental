# Dockerfile
FROM node:18

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

# หรือเพิ่มเฉพาะ multer ก็ได้
# RUN npm install multer

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
