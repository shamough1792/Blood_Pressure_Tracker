(function () {
    const byId = id => document.getElementById(id);
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

    async function api(url, options) {
        options = options || {};
        options.headers = { ...(options.headers || {}), 'X-CSRF-Token': csrfToken };
        const response = await fetch(url, options);
        if (response.status === 401) {
            window.location.replace('/admin/login');
            throw new Error('登入已失效，請重新登入');
        }
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || '伺服器暫時無法處理請求');
        return data;
    }

    function showError(prefix, error) {
        showToast(prefix + '：' + error.message, 'error');
    }

    function showToast(message, type) {
        const region = byId('adminToastRegion');
        if (!region) return;
        const toast = document.createElement('div');
        toast.className = 'admin-toast' + (type === 'error' ? ' error' : '');
        toast.textContent = message;
        region.appendChild(toast);
        window.setTimeout(() => toast.remove(), 4000);
    }

    function confirmAction(message) {
        const modal = byId('confirmModal');
        if (!modal) return Promise.resolve(false);
        byId('confirmMessage').textContent = message;
        modal.style.display = 'flex';
        return new Promise(resolve => {
            const close = value => { modal.style.display = 'none'; resolve(value); };
            byId('confirmCancel').onclick = () => close(false);
            byId('confirmAccept').onclick = () => close(true);
        });
    }

    const addForm = byId('addForm');
    if (addForm) {
        addForm.addEventListener('submit', async event => {
            event.preventDefault();
            const button = addForm.querySelector('button[type=submit]');
            button.disabled = true;
            try {
                await api('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: byId('newName').value.trim(), color: byId('newColor').value }) });
                window.location.reload();
            } catch (error) { showError('新增失敗', error); button.disabled = false; }
        });
    }

    const userSearch = byId('userSearch');
    if (userSearch) userSearch.addEventListener('input', () => {
        const search = userSearch.value.trim().toLocaleLowerCase();
        const rows = [...document.querySelectorAll('#userTableBody tr[data-user-name]')];
        const visible = rows.filter(row => row.dataset.userName.toLocaleLowerCase().includes(search));
        rows.forEach(row => { row.hidden = !visible.includes(row); });
        const summary = byId('userSearchSummary');
        const empty = byId('userSearchEmpty');
        if (summary) summary.textContent = search ? `符合搜尋：${visible.length} 位使用者` : `${rows.length} 位使用者`;
        if (empty) empty.hidden = !search || visible.length > 0;
    });

    const editModal = byId('editModal');
    let editTrigger = null;
    function closeEdit() { if (editModal) editModal.style.display = 'none'; if (editTrigger) { editTrigger.focus(); editTrigger = null; } }
    if (editModal) {
        editModal.addEventListener('click', event => { if (event.target === editModal) closeEdit(); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape') closeEdit(); });
        byId('closeEdit').addEventListener('click', closeEdit);
        byId('saveEdit').addEventListener('click', async () => {
            const button = byId('saveEdit'); button.disabled = true;
            try {
                await api('/api/users/' + encodeURIComponent(byId('editId').value), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: byId('editName').value.trim(), color: byId('editColor').value }) });
                window.location.reload();
            } catch (error) { showError('編輯失敗', error); button.disabled = false; }
        });
    }

    document.addEventListener('click', async event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const { action, id, name, color } = button.dataset;
        if (action === 'edit-user') {
            editTrigger = button;
            byId('editId').value = id; byId('editName').value = name; byId('editColor').value = color;
            editModal.style.display = 'flex'; byId('editName').focus();
        }
        if (action === 'delete-user' && await confirmAction('確定刪除 ' + name + '？所有相關血壓記錄也會一併刪除。')) {
            button.disabled = true;
            try { await api('/api/users/' + encodeURIComponent(id), { method: 'DELETE' }); window.location.reload(); }
            catch (error) { showError('刪除失敗', error); button.disabled = false; }
        }
    });

    const recordUserFilter = byId('recordUserFilter');
    const recordFromFilter = byId('recordFromFilter');
    const recordToFilter = byId('recordToFilter');
    const recordStatusFilter = byId('recordStatusFilter');
    const recordSortFilter = byId('recordSortFilter');
    const recordFilterSummary = byId('recordFilterSummary');
    const recordFilterEmpty = byId('recordFilterEmpty');
    const recordTableBody = byId('recordTableBody');
    const recordFilterReset = byId('recordFilterReset');
    if (recordTableBody && recordUserFilter) {
        const rows = [...recordTableBody.querySelectorAll('tr[data-user-id]')];
        const applyRecordFilters = () => {
            const from = recordFromFilter.value ? new Date(recordFromFilter.value + 'T00:00:00') : null;
            const to = recordToFilter.value ? new Date(recordToFilter.value + 'T23:59:59.999') : null;
            const user = recordUserFilter.value;
            const status = recordStatusFilter.value;
            const visibleRows = rows.filter(row => {
                const recordedAt = new Date(row.dataset.recordedAt);
                return (!user || row.dataset.userId === user)
                    && (!from || recordedAt >= from)
                    && (!to || recordedAt <= to)
                    && (!status || row.dataset.status === status);
            });
            rows.forEach(row => { row.hidden = !visibleRows.includes(row); });
            visibleRows.sort((a, b) => {
                const difference = new Date(a.dataset.recordedAt) - new Date(b.dataset.recordedAt);
                return recordSortFilter.value === 'oldest' ? difference : -difference;
            }).forEach(row => recordTableBody.appendChild(row));
            recordFilterSummary.textContent = `符合條件：${visibleRows.length} 筆`;
            recordFilterEmpty.hidden = rows.length === 0 || visibleRows.length > 0;
        };
        [recordUserFilter, recordFromFilter, recordToFilter, recordStatusFilter, recordSortFilter].forEach(control => control.addEventListener('change', applyRecordFilters));
        recordFilterReset.addEventListener('click', () => {
            recordUserFilter.value = ''; recordFromFilter.value = ''; recordToFilter.value = ''; recordStatusFilter.value = ''; recordSortFilter.value = 'newest'; applyRecordFilters();
        });
        applyRecordFilters();
    }

    const importForm = byId('importForm');
    let pendingBackup = null;
    let pendingUserId = null;
    if (importForm) importForm.addEventListener('submit', async event => {
        event.preventDefault();
        const file = byId('backupFile').files[0]; if (!file) return;
        pendingBackup = file;
        pendingUserId = byId('importUser').value;
        byId('confirmImportBtn').hidden = true;
        const formData = new FormData(); formData.append('backupFile', file); formData.append('user_id', pendingUserId);
        const button = byId('importBtn'), result = byId('importResult');
        button.disabled = true; button.textContent = '匯入中…'; result.hidden = true;
        try {
            const response = await fetch('/api/import-backup/preview', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: formData });
            if (response.status === 401) { window.location.href = '/admin/login'; return; }
            const isJson = response.headers.get('content-type')?.includes('application/json');
            const payload = isJson ? await response.json() : await response.text();
            const message = isJson ? payload.error : payload;
            if (!response.ok) throw new Error(message || '伺服器暫時無法處理請求');
            result.textContent = `備份共 ${payload.total} 筆，可匯入 ${payload.valid} 筆，略過 ${payload.skipped} 筆。`; result.hidden = false;
            byId('confirmImportBtn').hidden = false;
        } catch (error) { pendingBackup = null; pendingUserId = null; result.textContent = '匯入失敗：' + error.message; result.hidden = false; }
        finally { button.disabled = false; button.textContent = '檢查備份'; }
    });

    const confirmImportBtn = byId('confirmImportBtn');
    if (confirmImportBtn) confirmImportBtn.addEventListener('click', async () => {
        if (!pendingBackup || !await confirmAction('確認將預覽中的有效記錄寫入指定使用者？')) return;
        const formData = new FormData(); formData.append('backupFile', pendingBackup); formData.append('user_id', pendingUserId);
        confirmImportBtn.disabled = true;
        try {
            const response = await fetch('/api/import-backup/confirm', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: formData });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || '匯入失敗');
            showToast(`匯入完成：成功 ${payload.imported} 筆，略過 ${payload.skipped} 筆`);
            confirmImportBtn.hidden = true;
        } catch (error) { showError('匯入失敗', error); }
        finally { confirmImportBtn.disabled = false; }
    });

    if (byId('importUser')) byId('importUser').addEventListener('change', () => {
        pendingBackup = null; pendingUserId = null;
        if (confirmImportBtn) confirmImportBtn.hidden = true;
    });
})();
