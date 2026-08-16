const ExcelJS = require('exceljs');

// 血壓分級顏色
function getBpColor(hp, lp) {
    if (hp >= 140 || lp >= 90) return 'FFCDD2'; // red
    if (hp < 90 || lp < 60) return 'B3E5FC';  // blue
    return 'C8E6C9'; // green
}

// 產生日曆格式 Excel workbook（每個月一個 sheet）
function buildExcel(results, userName) {
    // 依年月 → 日 → 早晚分組
    const months = {};
    results.forEach(record => {
        const d = new Date(record.recorded_at);
        const ym = `${d.getFullYear()}年${d.getMonth() + 1}月`;
        const day = d.getDate();
        const period = d.getHours() < 12 ? '早' : '晚';

        if (!months[ym]) months[ym] = {};
        if (!months[ym][day]) months[ym][day] = {};
        months[ym][day][period] = {
            high: record.high_pressure,
            low: record.low_pressure,
            heart: record.heartbeat
        };
    });

    const workbook = new ExcelJS.Workbook();

    Object.keys(months).sort((a, b) => {
        const [ya, ma] = a.replace('年', '-').replace('月', '').split('-');
        const [yb, mb] = b.replace('年', '-').replace('月', '').split('-');
        return ya - yb || ma - mb;
    }).forEach(month => {
        const sheet = workbook.addWorksheet(month);
        const data = months[month];

        // Column widths
        for (let c = 1; c <= 11; c++) sheet.getColumn(c).width = 7;
        sheet.getColumn(1).width = 5;
        sheet.getColumn(2).width = 5;
        sheet.getColumn(6).width = 5;   // gap
        sheet.getColumn(7).width = 5;
        sheet.getColumn(8).width = 5;

        // Row 1: Title (merged A-K)
        sheet.mergeCells('A1:K2');
        const titleRow = sheet.getRow(1);
        titleRow.getCell(1).value = '血壓記錄表' + (userName ? ' (' + userName + ')' : '');
        titleRow.getCell(1).font = { bold: true, size: 16 };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 36;

        // Row 3: Month
        sheet.mergeCells('A3:K3');
        const monthRow = sheet.getRow(3);
        monthRow.getCell(1).value = `(${month}) 月份`;
        monthRow.getCell(1).font = { bold: true, size: 12 };
        monthRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        // Thin border
        const thinBorder = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
        };

        // Row 4: Headers (11 cols: A-K)
        const headerRow = sheet.getRow(4);
        const hdrs = ['', '時間', '上壓', '下壓', '心跳', '', '', '時間', '上壓', '下壓', '心跳'];
        for (let i = 0; i < 11; i++) {
            const cell = headerRow.getCell(i + 1);
            cell.value = hdrs[i];
            cell.font = { bold: true, size: 10 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            if (i !== 5) cell.border = thinBorder;
        }
        headerRow.height = 22;

        // Data rows: 11 cols [dayL, time, 上, 下, 心, gap, dayR, time, 上, 下, 心]
        let startRow = 5;
        for (let ld = 1; ld <= 16; ld++) {
            const rd = ld + 16;

            // --- 早 row ---
            const rowE = sheet.getRow(startRow);
            const vE = ['', '', '', '', '', '', '', '', '', '', ''];
            vE[0] = `${ld}號`;
            vE[1] = '早';
            vE[6] = rd <= 31 ? `${rd}號` : '';
            vE[7] = rd <= 31 ? '早' : '';

            if (data[ld] && data[ld]['早']) {
                vE[2] = data[ld]['早'].high;
                vE[3] = data[ld]['早'].low;
                vE[4] = data[ld]['早'].heart;
            }
            if (rd <= 31 && data[rd] && data[rd]['早']) {
                vE[8] = data[rd]['早'].high;
                vE[9] = data[rd]['早'].low;
                vE[10] = data[rd]['早'].heart;
            }

            for (let i = 0; i < 11; i++) {
                const cell = rowE.getCell(i + 1);
                cell.value = vE[i];
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.font = { size: 10 };
                if (i !== 5) cell.border = thinBorder;
            }

            if (data[ld] && data[ld]['早']) {
                const c = getBpColor(data[ld]['早'].high, data[ld]['早'].low);
                rowE.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                rowE.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
            }
            if (rd <= 31 && data[rd] && data[rd]['早']) {
                const c = getBpColor(data[rd]['早'].high, data[rd]['早'].low);
                rowE.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                rowE.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
            }
            rowE.height = 20;

            // --- 晚 row ---
            const rowL = sheet.getRow(startRow + 1);
            const vL = ['', '', '', '', '', '', '', '', '', '', ''];
            vL[0] = `${ld}號`;
            vL[1] = '晚';
            vL[6] = rd <= 31 ? `${rd}號` : '';
            vL[7] = rd <= 31 ? '晚' : '';

            if (data[ld] && data[ld]['晚']) {
                vL[2] = data[ld]['晚'].high;
                vL[3] = data[ld]['晚'].low;
                vL[4] = data[ld]['晚'].heart;
            }
            if (rd <= 31 && data[rd] && data[rd]['晚']) {
                vL[8] = data[rd]['晚'].high;
                vL[9] = data[rd]['晚'].low;
                vL[10] = data[rd]['晚'].heart;
            }

            for (let i = 0; i < 11; i++) {
                const cell = rowL.getCell(i + 1);
                cell.value = vL[i];
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.font = { size: 10 };
                if (i !== 5) cell.border = thinBorder;
            }

            if (data[ld] && data[ld]['晚']) {
                const c = getBpColor(data[ld]['晚'].high, data[ld]['晚'].low);
                rowL.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                rowL.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
            }
            if (rd <= 31 && data[rd] && data[rd]['晚']) {
                const c = getBpColor(data[rd]['晚'].high, data[rd]['晚'].low);
                rowL.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                rowL.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
            }
            rowL.height = 20;

            // Merge day number cells vertically
            sheet.mergeCells(`A${startRow}:A${startRow + 1}`);
            if (rd <= 31) {
                sheet.mergeCells(`G${startRow}:G${startRow + 1}`);
            }

            // Separator row between days
            const sepRow = sheet.getRow(startRow + 2);
            sepRow.height = 6;
            startRow += 3;
        }
    });

    return workbook;
}

module.exports = { buildExcel };
