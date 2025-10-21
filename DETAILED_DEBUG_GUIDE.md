# 🔧 คู่มือ Debug แบบละเอียด - หาสาเหตุปัญหาวันที่ไม่ตรง

## 🎯 **เป้าหมาย:**
หาสาเหตุที่ปฏิทินแสดงวันที่ 6, 7, 8 แต่ฐานข้อมูลมีข้อมูลวันที่ 7, 8, 9

## 🛠️ **การแก้ไขที่ดำเนินการแล้ว:**

### **1. เพิ่ม Debug Logging ใน Frontend:**
```javascript
// ใน loadScheduleData()
console.log('🔍 Loading schedule data...');
console.log('📊 API Response:', data);
console.log('📅 Schedule data loaded:', allEvents);

// ใน eventDidMount()
console.log('🔍 Event Did Mount:', {
  eventId: info.event.id,
  title: info.event.title,
  start: info.event.startStr,
  props: props
});
```

### **2. เพิ่ม Debug Logging ใน Backend:**
```javascript
// ใน getScheduleAPI()
console.log('🔍 Processing schedule:', {
  schedule_id: schedule.schedule_id,
  schedule_date: schedule.schedule_date,
  start_time: schedule.start_time,
  end_time: schedule.end_time,
  startDateTime: startDateTime,
  endDateTime: endDateTime,
  dentist: `${schedule.fname} ${schedule.lname}`
});
```

### **3. แก้ไข Timezone Issues:**
```javascript
// FullCalendar Configuration
timeZone: 'Asia/Bangkok'

// API DateTime Format
const startDateTime = `${schedule.schedule_date}T${schedule.start_time}+07:00`;
```

## 🧪 **วิธีทดสอบแบบละเอียด:**

### **ขั้นตอนที่ 1: เปิด Browser Console**
1. ไปที่ `http://localhost:3000/admin/schedule`
2. **เปิด Browser Console** (กด F12)
3. **รีเฟรชหน้าเว็บ** (กด F5)

### **ขั้นตอนที่ 2: ตรวจสอบ Server Logs**
1. **ดู terminal ที่รัน server**
2. **มองหาข้อความที่ขึ้นต้นด้วย:**
   - `🔍 Processing schedule:`
   - `📊 Total events created:`
   - `📅 Events:`

### **ขั้นตอนที่ 3: ตรวจสอบ Browser Console**
1. **มองหาข้อความที่ขึ้นต้นด้วย:**
   - `🔍 Loading schedule data...`
   - `📊 API Response:`
   - `📅 Schedule data loaded:`
   - `📅 Event 1:`, `📅 Event 2:`, etc.
   - `🔍 Event Did Mount:`

### **ขั้นตอนที่ 4: ตรวจสอบข้อมูลในฐานข้อมูล**
```bash
docker exec mysql mysql -uroot -proot dentist_db -e "SELECT schedule_date, start_time, end_time, fname, lname FROM dentist_schedule ds LEFT JOIN dentist d ON ds.dentist_id = d.dentist_id WHERE schedule_date BETWEEN '2025-10-07' AND '2025-10-09' ORDER BY schedule_date, start_time;"
```

## 🔍 **สิ่งที่ต้องตรวจสอบ:**

### **1. ข้อมูลในฐานข้อมูล:**
- **ควรมี:** วันที่ 7, 8, 9 ตุลาคม 2025
- **เวลา:** 10:00-14:00
- **ทันตแพทย์:** ID 1 และ ID 2

### **2. API Response:**
- **startDateTime:** `2025-10-07T10:00:00+07:00`
- **endDateTime:** `2025-10-07T14:00:00+07:00`
- **extendedProps:** มีข้อมูลทันตแพทย์ครบถ้วน

### **3. Frontend Processing:**
- **Events array:** มีข้อมูลครบถ้วน
- **FullCalendar:** แสดงวันที่ถูกต้อง
- **eventDidMount:** ทำงานถูกต้อง

## 🚨 **ปัญหาที่อาจพบ:**

### **1. Timezone Issues:**
```
❌ ฐานข้อมูล: 2025-10-07
❌ API ส่ง: 2025-10-07T10:00:00 (ไม่มี timezone)
❌ FullCalendar แสดง: 2025-10-06 (ลดไป 1 วัน)
```

### **2. Date Parsing Issues:**
```
❌ API ส่ง: 2025-10-07T10:00:00+07:00
❌ FullCalendar แปลงผิด: 2025-10-06T03:00:00Z
❌ แสดงผล: 2025-10-06
```

### **3. Event Processing Issues:**
```
❌ extendedProps: undefined
❌ CSS classes ไม่ถูกเพิ่ม
❌ การแสดงผลผิดพลาด
```

## 🔧 **วิธีแก้ไขตามปัญหา:**

### **หากพบ Timezone Issues:**
```javascript
// ตรวจสอบ FullCalendar timezone
console.log('FullCalendar timezone:', calendar.getOption('timeZone'));

// ตรวจสอบ browser timezone
console.log('Browser timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
```

### **หากพบ Date Parsing Issues:**
```javascript
// ตรวจสอบ date parsing
const testDate = new Date('2025-10-07T10:00:00+07:00');
console.log('Parsed date:', testDate);
console.log('ISO string:', testDate.toISOString());
```

### **หากพบ Event Processing Issues:**
```javascript
// ตรวจสอบ extendedProps
console.log('Event extendedProps:', info.event.extendedProps);
console.log('Event props:', props);
```

## 📊 **ตัวอย่าง Log ที่ควรเห็น:**

### **Server Logs:**
```
🔍 Processing schedule: {
  schedule_id: 1380,
  schedule_date: '2025-10-07',
  start_time: '10:00:00',
  end_time: '10:30:00',
  startDateTime: '2025-10-07T10:00:00+07:00',
  endDateTime: '2025-10-07T10:30:00+07:00',
  dentist: 'กานต์ชนก ปรีชาธน'
}
📊 Total events created: 48
```

### **Browser Console:**
```
🔍 Loading schedule data...
📊 API Response: {success: true, events: [...], total: 48}
📅 Schedule data loaded: [Array(48)]
📅 Event 1: {id: "schedule_1380", title: "กานต์ชนก ปรีชาธน", start: "2025-10-07T10:00:00+07:00", ...}
🔍 Event Did Mount: {eventId: "schedule_1380", title: "กานต์ชนก ปรีชาธน", start: "2025-10-07", props: {...}}
```

## 🎯 **ผลลัพธ์ที่คาดหวัง:**

### **หลัง Debug:**
- ✅ **Server logs แสดงข้อมูลถูกต้อง**
- ✅ **Browser console แสดงข้อมูลถูกต้อง**
- ✅ **ปฏิทินแสดงวันที่ 7, 8, 9 ตุลาคม**
- ✅ **ข้อมูลตรงกับฐานข้อมูล**

## 🚀 **Ready to Debug!**

**กรุณาทำตามขั้นตอนข้างต้นและแจ้งผลลัพธ์ให้ฉันทราบครับ!**

หากพบปัญหาใดๆ ให้คัดลอกข้อความจาก Console และ Server logs มาให้ฉันดูเพื่อวิเคราะห์ปัญหาเพิ่มเติม
