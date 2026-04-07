/**
 * DivisionX Card — Stock Calculator Utilities
 * คำนวณจำนวนซองจากหน่วยต่างๆ
 */

/**
 * แปลงจำนวนเป็นซอง ตาม SKU
 * @param {number} quantity - จำนวน
 * @param {'pack'|'box'|'cotton'} unit - หน่วย
 * @param {object} sku - ข้อมูล SKU (packs_per_box, boxes_per_cotton)
 * @returns {number} จำนวนซอง
 */
function convertToPacks(quantity, unit, sku) {
  const { packs_per_box, boxes_per_cotton } = sku
  switch (unit) {
    case 'pack':
      return quantity
    case 'box':
      return quantity * packs_per_box
    case 'cotton':
      return quantity * boxes_per_cotton * packs_per_box
    default:
      throw new Error(`หน่วยไม่ถูกต้อง: ${unit}`)
  }
}

/**
 * ตรวจสอบว่าสต็อกเพียงพอก่อนเบิก
 * @param {number} currentBalance - สต็อกคงเหลือ (ซอง)
 * @param {number} requestedPacks - จำนวนที่ต้องการเบิก (ซอง)
 * @returns {{ ok: boolean, message?: string }}
 */
function validateWithdrawal(currentBalance, requestedPacks) {
  if (requestedPacks <= 0) {
    return { ok: false, message: 'จำนวนที่เบิกต้องมากกว่า 0' }
  }
  if (requestedPacks > currentBalance) {
    return {
      ok: false,
      message: `สต็อกไม่เพียงพอ: คงเหลือ ${currentBalance} ซอง แต่ต้องการ ${requestedPacks} ซอง`
    }
  }
  return { ok: true }
}

module.exports = { convertToPacks, validateWithdrawal }
