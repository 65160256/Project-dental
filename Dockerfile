# ใช้ official Node.js image
FROM node:18-alpine

# ติดตั้ง dependencies ที่จำเป็น
RUN apk add --no-cache tzdata

# ตั้งค่า timezone (optional)
ENV TZ=Asia/Bangkok

WORKDIR /usr/src/app

# Copy package files และติดตั้ง dependencies
COPY package*.json ./
RUN npm ci --only=production || npm install --only=production

# Copy source code
COPY . .

# ✅ สร้างโฟลเดอร์ uploads และให้สิทธิ์
RUN mkdir -p public/uploads && \
    chmod -R 777 public/uploads && \
    ls -la public/

# ✅ ตรวจสอบว่ามีโฟลเดอร์ config
RUN ls -la config/ || (echo "❌ Missing config/ directory" && exit 1)

# ✅ ตรวจสอบว่าสร้าง uploads สำเร็จ
RUN ls -la public/uploads/ && echo "✅ Uploads directory created"

ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

# ✅ รัน app ด้วย node แทน npm start (เร็วกว่า)
CMD ["node", "app.js"]