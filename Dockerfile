# ใช้ alpine เพื่อลดขนาด และเป็นทางเลือกถ้าดึง node:18 ไม่ผ่าน
FROM mcr.microsoft.com/mirror/docker/library/node:18-alpine

# ส่วนอื่นๆ เหมือนเดิม

WORKDIR /usr/src/app

# ตั้งค่า TZ เป็น Asia/Bangkok (เลือกได้)
# RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/Asia/Bangkok /etc/localtime && echo "Asia/Bangkok" > /etc/timezone

# ติดตั้ง deps จาก lockfile เพื่อ build เร็วและ deterministic
COPY package*.json ./
# ถ้ามี package-lock.json ใช้ npm ci เร็วและสะอาดกว่า
RUN npm ci || npm install

# คัดลอกซอร์สโค้ดส่วนที่เหลือ
COPY . .

# ตรวจสอบมีโฟลเดอร์ config (ตามที่คุณเช็คไว้)
RUN ls -la config/ || (echo "Missing config/ directory" && exit 1)

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]

