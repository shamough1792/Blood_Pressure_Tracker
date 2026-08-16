// 通用工具函式

// 格式化日期做檔名：2026年08月16日_17時56分
function formatDateForFilename(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}年${month}月${day}日_${hours}時${minutes}分`;
}

module.exports = { formatDateForFilename };
