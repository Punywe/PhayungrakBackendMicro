# ใช้ official Node.js image
FROM node:18-alpine

# ตั้งค่า working directory ใน container
WORKDIR /usr/src/app

# คัดลอก package.json และ package-lock.json
COPY package*.json ./

# ติดตั้ง dependencies
RUN npm install

# คัดลอกซอร์สโค้ดทั้งหมดเข้าไปใน container
COPY . .

# เปิดพอร์ตที่แอพใช้งาน
EXPOSE 13000

# รัน Backend
CMD ["npm", "start"]
