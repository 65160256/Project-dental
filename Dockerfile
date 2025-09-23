FROM node:18

WORKDIR /usr/src/app

# คัดลอก package.json และติดตั้ง dependencies
COPY package*.json ./
RUN npm install

# คัดลอกไฟล์ .env (ถ้าใช้)
COPY .env ./

# คัดลอกไฟล์ทั้งหมด
COPY . .

# ตรวจสอบว่าโฟลเดอร์ config มีอยู่
RUN ls -la config/

EXPOSE 3000
CMD ["npm", "start"]