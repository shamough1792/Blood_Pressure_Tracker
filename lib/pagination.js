function buildPaginationItems(totalPages, currentPage, radius = 2) {
    const total = Math.max(0, Number.parseInt(totalPages, 10) || 0);
    const current = Math.min(total, Math.max(1, Number.parseInt(currentPage, 10) || 1));
    const pages = [];

    for (let page = 1; page <= total; page++) {
        if (page === 1 || page === total || Math.abs(page - current) <= radius) {
            pages.push(page);
        } else if (pages[pages.length - 1] !== 'ellipsis') {
            pages.push('ellipsis');
        }
    }

    return pages;
}

module.exports = { buildPaginationItems };
