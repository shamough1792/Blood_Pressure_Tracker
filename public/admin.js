(function () {
    const byId = id => document.getElementById(id);

    async function api(url, options) {
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
        window.alert(prefix + '：' + error.message);
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
        document.querySelectorAll('#userTableBody tr[data-user-name]').forEach(row => { row.hidden = !row.dataset.userName.toLocaleLowerCase().includes(search); });
    });

    const editModal = byId('editModal');
    function closeEdit() { if (editModal) editModal.style.display = 'none'; }
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
            byId('editId').value = id; byId('editName').value = name; byId('editColor').value = color;
            editModal.style.display = 'flex'; byId('editName').focus();
        }
        if (action === 'delete-user' && window.confirm('確定刪除 ' + name + '？所有相關血壓記錄也會一併刪除。')) {
            button.disabled = true;
            try { await api('/api/users/' + encodeURIComponent(id), { method: 'DELETE' }); window.location.reload(); }
            catch (error) { showError('刪除失敗', error); button.disabled = false; }
        }
    });

    const recordUserFilter = byId('recordUserFilter');
    if (recordUserFilter) recordUserFilter.addEventListener('change', () => {
        document.querySelectorAll('#recordTableBody tr[data-user-id]').forEach(row => { row.hidden = recordUserFilter.value !== '' && row.dataset.userId !== recordUserFilter.value; });
    });

    const importForm = byId('importForm');
    if (importForm) importForm.addEventListener('submit', async event => {
        event.preventDefault();
        const file = byId('sqlFile').files[0]; if (!file) return;
        const formData = new FormData(); formData.append('sqlFile', file); formData.append('user_id', byId('importUser').value);
        const button = byId('importBtn'), result = byId('importResult');
        button.disabled = true; button.textContent = '匯入中…'; result.hidden = true;
        try {
            const response = await fetch('/api/import-sql', { method: 'POST', body: formData });
            if (response.status === 401) { window.location.href = '/admin/login'; return; }
            const message = await response.text();
            if (!response.ok) throw new Error(message || '伺服器暫時無法處理請求');
            result.textContent = message; result.hidden = false;
        } catch (error) { result.textContent = '匯入失敗：' + error.message; result.hidden = false; }
        finally { button.disabled = false; button.textContent = '上傳並匯入'; }
    });
})();
