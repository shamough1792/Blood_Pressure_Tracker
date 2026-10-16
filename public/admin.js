(function () {
    const byId = id => document.getElementById(id);
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';
    const dialogTriggers = new WeakMap();
    let activeDialog = null;
    function openDialog(modal) {
        dialogTriggers.set(modal, document.activeElement);
        activeDialog = modal;
        modal.style.display = 'flex';
        [...modal.querySelectorAll('input:not([type=hidden]),button')].find(el => el.getClientRects().length)?.focus();
    }
    function closeDialog(modal) {
        modal.style.display = 'none';
        activeDialog = null;
        dialogTriggers.get(modal)?.focus();
    }
    document.addEventListener('keydown', event => {
        if (!activeDialog) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            if (activeDialog.cancelAction) activeDialog.cancelAction();
            else closeDialog(activeDialog);
        }
        if (event.key === 'Tab') {
            const focusable = [...activeDialog.querySelectorAll('input:not([type=hidden]),button,select,textarea,a[href]')].filter(el => !el.disabled && el.getClientRects().length);
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
        }
    });

    async function api(url, options) {
        options = options || {};
        options.headers = { ...(options.headers || {}), 'X-CSRF-Token': csrfToken };
        const response = await fetch(url, options);
        if (response.status === 401) {
            window.location.replace('/admin/login');
            throw new Error('登入已失效，請重新登入');
        }
        const isJson = response.headers.get('content-type')?.includes('application/json');
        const data = isJson ? await response.json() : { error: '伺服器暫時無法處理請求' };
        if (!response.ok || data.error) throw new Error(data.error || '伺服器暫時無法處理請求');
        return data;
    }

    function showError(prefix, error) {
        showToast(prefix + '：' + error.message, 'error');
    }

    function showFieldError(inputId, errorId, message) {
        const input = byId(inputId);
        const error = byId(errorId);
        if (input) input.classList.toggle('admin-field-invalid', Boolean(message));
        if (error) {
            error.textContent = message || '';
            error.hidden = !message;
        }
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

    function confirmAction(message, needsReason = false, records = []) {
        const modal = byId('confirmModal');
        if (!modal) return Promise.resolve(false);
        byId('confirmMessage').textContent = message;
        const details = byId('confirmDetails');
        details.replaceChildren();
        details.hidden = !records.length;
        if (records.length) {
            const list = document.createElement('ol');
            records.forEach(record => {
                const item = document.createElement('li');
                item.textContent = `#${record.id} · ${record.user_name || '已移除使用者'} · ${new Date(record.recorded_at).toLocaleString('zh-HK')} · ${record.high_pressure}/${record.low_pressure} mmHg · 心跳 ${record.heartbeat} bpm`;
                list.appendChild(item);
            });
            details.appendChild(list);
        }
        const reason = byId('confirmReason');
        byId('confirmReasonField').hidden = !needsReason;
        reason.required = needsReason; reason.value = '';
        openDialog(modal);
        return new Promise(resolve => {
            const close = value => { closeDialog(modal); resolve(value); };
            modal.cancelAction = () => close(false);
            byId('confirmCancel').onclick = () => close(false);
            byId('confirmAccept').onclick = () => { if (needsReason && !reason.reportValidity()) return; close(needsReason ? reason.value.trim() : true); };
        });
    }

    const addForm = byId('addForm');
    if (addForm) {
        byId('newName').addEventListener('input', () => showFieldError('newName', 'addUserError', ''));
        addForm.addEventListener('submit', async event => {
            event.preventDefault();
            const name = byId('newName').value.trim();
            if (!name) {
                showFieldError('newName', 'addUserError', '請輸入使用者姓名');
                byId('newName').focus();
                return;
            }
            const button = addForm.querySelector('button[type=submit]');
            button.disabled = true;
            try {
                await api('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color: byId('newColor').value }) });
                window.location.reload();
            } catch (error) { showFieldError('newName', 'addUserError', error.message); button.disabled = false; }
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
    function closeEdit() { if (editModal) closeDialog(editModal); if (editTrigger) { editTrigger.focus(); editTrigger = null; } }
    if (editModal) {
        editModal.addEventListener('click', event => { if (event.target === editModal) closeEdit(); });
        byId('closeEdit').addEventListener('click', closeEdit);
        byId('editName').addEventListener('input', () => showFieldError('editName', 'editUserError', ''));
        byId('saveEdit').addEventListener('click', async () => {
            const button = byId('saveEdit'); button.disabled = true;
            try {
                await api('/api/users/' + encodeURIComponent(byId('editId').value), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: byId('editName').value.trim(), color: byId('editColor').value }) });
                window.location.reload();
            } catch (error) { showFieldError('editName', 'editUserError', error.message); button.disabled = false; }
        });
    }

    document.addEventListener('click', async event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const { action, id, name, color } = button.dataset;
        if (action === 'edit-user') {
            editTrigger = button;
            byId('editId').value = id; byId('editName').value = name; byId('editColor').value = color;
            openDialog(editModal); byId('editName').focus();
        }
        if (action === 'delete-user' && await confirmAction('確定刪除 ' + name + '？將永久刪除此使用者及 ' + button.dataset.count + ' 筆血壓記錄。請先備份。')) {
            button.disabled = true;
            try { await api('/api/users/' + encodeURIComponent(id), { method: 'DELETE' }); window.location.reload(); }
            catch (error) { showError('刪除失敗', error); button.disabled = false; }
        }
    });

    let editingRecord = null;
    const recordModal = byId('recordEditModal');
    byId('closeRecordEdit')?.addEventListener('click', () => closeDialog(recordModal));
    document.addEventListener('click', async event => {
        const button = event.target.closest('[data-record-action]');
        if (!button || button.disabled) return;
        if (button.dataset.recordAction === 'edit') {
            editingRecord = { ...button.dataset };
            byId('recordHigh').value = editingRecord.high;
            byId('recordLow').value = editingRecord.low;
            byId('recordHeart').value = editingRecord.heart;
            const date = new Date(editingRecord.time);
            byId('recordTime').value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
            byId('recordReason').value = '';
            byId('recordEditError').hidden = true;
            openDialog(recordModal);
        } else {
            const reason = await confirmAction('確定永久刪除此筆血壓記錄？請先確認備份。', true);
            if (!reason) return;
            button.disabled = true;
            try { await api('/api/records/' + button.dataset.id, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }); window.location.reload(); }
            catch (error) { showError('刪除失敗', error); button.disabled = false; }
        }
    });
    byId('recordEditForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const button = byId('saveRecordEdit');
        button.disabled = true;
        try {
            await api('/api/records/' + editingRecord.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                high_pressure: byId('recordHigh').value, low_pressure: byId('recordLow').value, heartbeat: byId('recordHeart').value,
                recorded_at: new Date(byId('recordTime').value).toISOString(), reason: byId('recordReason').value,
                expected_at: editingRecord.time, expected_high: editingRecord.high, expected_low: editingRecord.low, expected_heart: editingRecord.heart
            }) });
            window.location.reload();
        } catch (error) { const message = byId('recordEditError'); message.textContent = error.message; message.hidden = false; button.disabled = false; }
    });
    function updateSelection() {
        const boxes = [...document.querySelectorAll('.record-select')];
        const count = boxes.filter(box => box.checked).length;
        byId('bulkDeleteRecords').disabled = !count;
        byId('recordSelectionCount').textContent = `已選 ${count} 筆（僅限本頁）`;
        if (byId('selectAllRecords')) { byId('selectAllRecords').checked = count > 0 && count === boxes.length; byId('selectAllRecords').indeterminate = count > 0 && count < boxes.length; }
    }
    byId('selectAllRecords')?.addEventListener('change', event => {
        document.querySelectorAll('.record-select').forEach(box => box.checked = event.target.checked);
        updateSelection();
    });
    document.querySelectorAll('.record-select').forEach(box => box.addEventListener('change', updateSelection));
    byId('bulkDeleteRecords')?.addEventListener('click', async event => {
        const ids = [...document.querySelectorAll('.record-select:checked')].map(box => Number(box.value));
        const button = event.target; button.disabled = true;
        try {
            const preview = await api('/api/records/delete-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
            const reason = await confirmAction(`請核對以下 ${preview.records.length} 筆記錄，確認後將永久刪除。`, true, preview.records);
            if (!reason) return;
            await api('/api/records/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, reason, fingerprint: preview.fingerprint }) });
            window.location.reload();
        } catch (error) { showError('批次刪除失敗', error); }
        finally { updateSelection(); }
    });

    const databaseBackupForm = byId('databaseBackupForm');
    if (databaseBackupForm) {
        const status = byId('databaseBackupStatus');
        status.addEventListener('change', () => {
            byId('databaseBackupReference').required = status.value === 'success';
            byId('databaseBackupNote').required = status.value === 'failure';
        });
        databaseBackupForm.addEventListener('submit', async event => {
            event.preventDefault();
            const button = databaseBackupForm.querySelector('button[type=submit]');
            const result = byId('databaseBackupResult');
            button.disabled = true; result.hidden = true;
            try {
                await api('/api/database-backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                    source: byId('databaseBackupSource').value, completed_at: new Date(byId('databaseBackupTime').value).toISOString(),
                    status: status.value, reference: byId('databaseBackupReference').value, checksum: byId('databaseBackupChecksum').value, note: byId('databaseBackupNote').value
                }) });
                window.location.reload();
            } catch (error) { result.textContent = error.message; result.hidden = false; button.disabled = false; }
        });
    }

    // 所有篩選皆提交到伺服器，畫面、分頁及匯出共用同一份條件。
    const recordFilters = document.querySelector('.admin-record-filters');
    if (recordFilters) recordFilters.querySelectorAll('select,input[type=date]').forEach(control => {
        control.addEventListener('change', () => { if (recordFilters.reportValidity()) recordFilters.requestSubmit(); });
    });

    const importForm = byId('importForm');
    let pendingBackup = null;
    let pendingUserId = null;
    let pendingMode = null;
    if (importForm) importForm.addEventListener('submit', async event => {
        event.preventDefault();
        const file = byId('backupFile').files[0]; if (!file) return;
        pendingBackup = file;
        pendingUserId = byId('importUser').value;
        pendingMode = byId('importMode').value;
        byId('confirmImportBtn').hidden = true;
        const formData = new FormData(); formData.append('backupFile', file); formData.append('user_id', pendingUserId); formData.append('mode', pendingMode);
        const button = byId('importBtn'), result = byId('importResult');
        button.disabled = true; ['importMode', 'importUser', 'backupFile'].forEach(id => byId(id).disabled = true); button.textContent = '檢查中…'; result.hidden = true; result.classList.remove('admin-result-error');
        try {
            const response = await fetch('/api/import-backup/preview', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: formData });
            if (response.status === 401) { window.location.href = '/admin/login'; return; }
            const isJson = response.headers.get('content-type')?.includes('application/json');
            const payload = isJson ? await response.json() : await response.text();
            const message = isJson ? payload.error : payload;
            if (!response.ok) throw new Error(message || '伺服器暫時無法處理請求');
            result.classList.remove('admin-result-error'); result.textContent = `備份共 ${payload.total} 筆，可新增 ${payload.valid} 筆，無效 ${payload.skipped} 筆，重複 ${payload.duplicates} 筆。來源版本 ${payload.sourceVersion}，匯出時間 ${payload.exportedAt}。使用者對應：` + payload.users.map(user => user.name + (user.targetId ? ` → ID #${user.targetId}` : ' → 新增使用者')).join('、'); result.hidden = false;
            byId('confirmImportBtn').hidden = false;
        } catch (error) { pendingBackup = null; pendingUserId = null; result.classList.add('admin-result-error'); result.textContent = '匯入失敗：' + error.message; result.hidden = false; }
        finally { button.disabled = false; ['importMode', 'backupFile'].forEach(id => byId(id).disabled = false); byId('importUser').disabled = byId('importMode').value === 'full'; button.textContent = '檢查備份'; }
    });

    const confirmImportBtn = byId('confirmImportBtn');
    if (confirmImportBtn) confirmImportBtn.addEventListener('click', async () => {
        if (!pendingBackup || !await confirmAction('確認依照預覽的使用者對應匯入資料？既有資料會保留，完全重複記錄會略過。')) return;
        const formData = new FormData(); formData.append('backupFile', pendingBackup); formData.append('user_id', pendingUserId); formData.append('mode', pendingMode);
        confirmImportBtn.disabled = true;
        ['importMode', 'importUser', 'backupFile', 'importBtn'].forEach(id => byId(id).disabled = true);
        try {
            const payload = await api('/api/import-backup/confirm', { method: 'POST', body: formData });
            showToast(`匯入完成：成功 ${payload.imported} 筆，略過 ${payload.skipped} 筆`);
            byId('importResult').textContent = `匯入完成：成功 ${payload.imported} 筆，略過 ${payload.skipped} 筆。可前往操作紀錄查看詳情。`;
            pendingBackup = null;
            confirmImportBtn.hidden = true;
        } catch (error) { const result = byId('importResult'); result.classList.add('admin-result-error'); result.textContent = '匯入失敗：' + error.message; result.hidden = false; }
        finally { confirmImportBtn.disabled = false; ['importMode', 'backupFile', 'importBtn'].forEach(id => byId(id).disabled = false); byId('importUser').disabled = byId('importMode').value === 'full'; }
    });

    function invalidatePreview() {
        pendingBackup = null; pendingUserId = null; pendingMode = null;
        if (confirmImportBtn) confirmImportBtn.hidden = true;
        if (byId('importResult')) byId('importResult').hidden = true;
        if (byId('importUser')) byId('importUser').disabled = byId('importMode').value === 'full';
    }
    ['importUser', 'importMode', 'backupFile'].forEach(id => byId(id)?.addEventListener('change', invalidatePreview));
    if (importForm) invalidatePreview();
})();
