// lib/propertyFacts.js — ข้อเท็จจริงของที่พัก ที่ AI ตอบแขกได้ (แหล่งเดียว แก้ที่นี่ที่เดียว)
// กติกา: AI ต้องตอบจากข้อความนี้เท่านั้น — เรื่องที่ไม่อยู่ในนี้ (เวลาเช็คอิน/เอาท์มาตรฐาน, ห้องว่าง, ส่วนลด) ให้บอกว่าทีมงานจะยืนยัน
export const PROPERTY_FACTS = `
The Loft Living Space — boutique short-term stay in Samut Prakan, Thailand, near Suvarnabhumi Airport, about an 8-minute walk from the MRT.
- ID / passport is required at check-in; passports of all guests are required.
- Keycard must be carried at all times (front gate, room entry, and electricity activation).
- Electricity: 10 THB per unit.
- Late check-in / late check-out: 100 THB per hour.
- Extra guest: 600 THB per night per person. Unapproved guests: 2,000 THB per person.
- Smoking and durians are strictly prohibited (2,000 THB per night violation charge).
- Cleaning service on request: 1,000 THB (all areas except laundry).
- Swimming pool at Eternal Club, about 3 minutes' walk, 100 THB per visit.
- Laundry on the ground floor, open 24 hours: wash 40 THB or 20 THB, dryer 40 THB per hour; ask staff for change. Water machine 1 THB per 1,000 cc. Food vending machine 24 hours.
- Microwave: copperware only; damages are charged.
- Garbage: right side of the building. No tissue or sanitary products in the toilet.
NOT in this list (do NOT invent): standard check-in/check-out times, availability, discounts, refunds, room changes, directions beyond "8 minutes' walk from the MRT".
`.trim();
