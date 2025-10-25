
// ===================================
// #region 1. 月曆
// ===================================

// 渲染日曆的函式
async function renderCalendar(date) {
    const monthTitle = document.getElementById('month-title');
    const calendarGrid = document.getElementById('calendar-grid');
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();

    // 生成 monthKey
    const monthkey = currentMonthDate.getFullYear() + "-" + String(currentMonthDate.getMonth() + 1).padStart(2, "0");

    // 檢查快取中是否已有該月份資料
    if (monthDataCache[monthkey]) {
        // 如果有，直接從快取讀取資料並渲染
        const records = monthDataCache[monthkey];
        renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle);
    } else {
        // 如果沒有，才發送 API 請求
        // 清空日曆，顯示載入狀態，並確保置中
        calendarGrid.innerHTML = '<div data-i18n="LOADING" class="col-span-full text-center text-gray-500 py-4">正在載入...</div>';
        renderTranslations(calendarGrid);
        try {
            //const res = await callApifetch(`getAttendanceDetails&month=${monthkey}&userId=${userId}`);
            const res = await callApifetch({
                action: 'getAttendanceDetails',
                month: monthkey,
                userId: userId
            })
            if (res.ok) {
                // 將資料存入快取
                monthDataCache[monthkey] = res.records;

                // 收到資料後，清空載入訊息
                calendarGrid.innerHTML = '';

                // 從快取取得本月資料
                const records = monthDataCache[monthkey] || [];
                renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle);
            } else {
                console.error("Failed to fetch attendance records:", res.msg);
                showNotification(t("ERROR_FETCH_RECORDS"), "error");
            }
        } catch (err) {
            console.error(err);
        }
    }
}

// 新增一個獨立的渲染函式，以便從快取或 API 回應中調用
// 🌟 關鍵修改：新增 isForAdmin 參數
function renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle, isForAdmin = false) {
    // 確保日曆網格在每次渲染前被清空
    calendarGrid.innerHTML = '';
    monthTitle.textContent = t("MONTH_YEAR_TEMPLATE", {
        year: year,
        month: month + 1
    });

    // 取得該月第一天是星期幾
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 填補月初的空白格子
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'day-cell';
        calendarGrid.appendChild(emptyCell);
    }

    // 根據資料渲染每一天的顏色
    for (let i = 1; i <= daysInMonth; i++) {
        const dayCell = document.createElement('div');
        const cellDate = new Date(year, month, i);
        dayCell.textContent = i;
        let dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        let dateClass = 'normal-day';

        const todayRecords = records.filter(r => r.date === dateKey);

        // ... (日曆顏色和資料集設定邏輯不變) ...
        if (todayRecords.length > 0) {
            const reason = todayRecords[0].reason;
            switch (reason) {
                case "STATUS_PUNCH_IN_MISSING":
                    dateClass = 'abnormal-day';
                    break;
                case "STATUS_PUNCH_OUT_MISSING":
                    dateClass = 'abnormal-day';
                    break;
                case "STATUS_PUNCH_NORMAL":
                    dateClass = 'day-off';
                    break;
                case "STATUS_REPAIR_PENDING":
                    dateClass = 'pending-virtual';
                    break;
                case "STATUS_REPAIR_APPROVED":
                    dateClass = 'approved-virtual';
                    break;
                default:
                    if (reason && reason !== "") {
                        dateClass = 'pending-adjustment'; // 假設所有有備註的都算 pending
                    }
                    break;
            }
        }

        const isToday = (year === today.getFullYear() && month === today.getMonth() && i === today.getDate());
        if (isToday) {
            dayCell.classList.add('today');
        } else if (cellDate > today) {
            dayCell.classList.add('future-day');
            dayCell.style.pointerEvents = 'none'; // 未來日期不可點擊
        } else {
            dayCell.classList.add(dateClass);
        }

        dayCell.classList.add('day-cell');
        dayCell.dataset.date = dateKey;
        dayCell.dataset.records = JSON.stringify(todayRecords); // 儲存當天資料

        // 🌟 關鍵：新增點擊事件監聽器 🌟
        dayCell.addEventListener('click', function () {
            // 排除未來日期
            if (cellDate > today) return;

            // 判斷是否為管理員日曆
            if (isForAdmin && adminSelectedUserId) {
                // 如果是管理員日曆，呼叫管理員專用的紀錄渲染函式
                renderAdminDailyRecords(this.dataset.date, adminSelectedUserId);
            } else if (!isForAdmin) {
                // 如果是員工自己的日曆，呼叫員工專用的紀錄渲染函式
                renderDailyRecords(this.dataset.date);
            }
        });

        calendarGrid.appendChild(dayCell);
    }
}

// 新增：渲染每日紀錄的函式 (修正非同步問題)
async function renderDailyRecords(dateKey) {
    const dailyRecordsCard = document.getElementById('daily-records-card');
    const dailyRecordsTitle = document.getElementById('daily-records-title');
    const dailyRecordsList = document.getElementById('daily-records-list');
    const dailyRecordsEmpty = document.getElementById('daily-records-empty');
    const recordsLoading = document.getElementById("records-loading");

    dailyRecordsTitle.textContent = t("DAILY_RECORDS_TITLE", {
        dateKey: dateKey
    });

    dailyRecordsList.innerHTML = '';
    dailyRecordsEmpty.style.display = 'none';
    recordsLoading.style.display = 'block';

    const dateObject = new Date(dateKey);
    const month = dateObject.getFullYear() + "-" + String(dateObject.getMonth() + 1).padStart(2, "0");
    const userId = localStorage.getItem("sessionUserId");

    // 檢查快取
    if (monthDataCache[month]) {
        renderRecords(monthDataCache[month]);
        recordsLoading.style.display = 'none';
    } else {
        // 否則從 API 取得資料
        try {
            //const res = await callApifetch(`getAttendanceDetails&month=${month}&userId=${userId}`);
            const res = await callApifetch({
                action: 'getAttendanceDetails',
                month: month,
                userId: userId
            })
            recordsLoading.style.display = 'none';
            if (res.ok) {
                // 將資料存入快取
                monthDataCache[month] = res.records;
                renderRecords(res.records);
            } else {
                console.error("Failed to fetch attendance records:", res.msg);
                showNotification(t("ERROR_FETCH_RECORDS"), "error");
            }
        } catch (err) {
            console.error(err);
        }
    }

    function renderRecords(records) {
        // 從該月份的所有紀錄中，過濾出所選日期的紀錄
        const dailyRecords = records.filter(record => {

            return record.date === dateKey
        });
        if (dailyRecords.length > 0) {
            dailyRecordsEmpty.style.display = 'none';
            dailyRecords.forEach(records => {
                const li = document.createElement('li');
                li.className = 'p-3 bg-gray-50 dark:bg-gray-700 rounded-lg';
                const recordHtml = records.record.map(r => {
                    // 根據 r.type 的值來選擇正確的翻譯鍵值
                    const typeKey = r.type === '上班' ? 'PUNCH_IN' : 'PUNCH_OUT';

                    return `
                        <p class="font-medium text-gray-800 dark:text-white">${r.time} - ${t(typeKey)}</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">${r.location}</p>
                        <p data-i18n="RECORD_NOTE_PREFIX" class="text-sm text-gray-500 dark:text-gray-400">備註：${r.note}</p>
                    `;
                }).join("");

                li.innerHTML = `
    ${recordHtml}
    <p class="text-sm text-gray-500 dark:text-gray-400">
        <span data-i18n="RECORD_REASON_PREFIX">系統判斷：</span>
        
        ${t(records.reason)}
    </p>                `;
                dailyRecordsList.appendChild(li);
                renderTranslations(li);
            });

        } else {
            dailyRecordsEmpty.style.display = 'block';
        }
        dailyRecordsCard.style.display = 'block';
    }
}

// #endregion
// ===================================

// UI切換邏輯
const switchTab = (tabId) => {
    const tabs = ['dashboard-view', 'monthly-view', 'location-view', 'admin-view'];
    const btns = ['tab-dashboard-btn', 'tab-monthly-btn', 'tab-location-btn', 'tab-admin-btn'];

    // 1. 移除舊的 active 類別和 CSS 屬性
    tabs.forEach(id => {
        const tabElement = document.getElementById(id);
        tabElement.style.display = 'none'; // 隱藏內容
        tabElement.classList.remove('active'); // 移除 active 類別
    });

    // 2. 移除按鈕的選中狀態
    btns.forEach(id => {
        const btnElement = document.getElementById(id);
        btnElement.classList.replace('bg-indigo-600', 'bg-gray-200');
        btnElement.classList.replace('text-white', 'text-gray-600');
    });

    // 3. 顯示新頁籤並新增 active 類別
    const newTabElement = document.getElementById(tabId);
    newTabElement.style.display = 'block'; // 顯示內容
    newTabElement.classList.add('active'); // 新增 active 類別

    // 4. 設定新頁籤按鈕的選中狀態
    const newBtnElement = document.getElementById(`tab-${tabId.replace('-view', '-btn')}`);
    newBtnElement.classList.replace('bg-gray-200', 'bg-indigo-600');
    newBtnElement.classList.replace('text-gray-600', 'text-white');

    // 5. 根據頁籤 ID 執行特定動作
    if (tabId === 'monthly-view') {
        renderCalendar(currentMonthDate);
    } else if (tabId === 'location-view') {
        initLocationMap(); // <-- 這行保持不變
    } else if (tabId === 'admin-view') {
        fetchAndRenderReviewRequests();
    }
};

function generalButtonState(button, state, loadingText = '處理中...') {
    if (!button) return;
    const loadingClasses = 'opacity-50 cursor-not-allowed';

    if (state === 'processing') {
        // --- 進入處理中狀態 ---

        // 1. 儲存原始文本 (用於恢復)
        button.dataset.originalText = button.textContent;

        // 2. 儲存原始類別 (用於恢復樣式)
        // 這是為了在恢復時移除我們為了禁用而添加的類別
        button.dataset.loadingClasses = 'opacity-50 cursor-not-allowed';

        // 3. 禁用並設置處理中文字
        button.disabled = true;
        button.textContent = loadingText; // 使用傳入的 loadingText

        // 4. 添加視覺反饋 (禁用時的樣式)
        button.classList.add(...loadingClasses.split(' '));

        // 可選：移除 hover 效果，防止滑鼠移動時顏色變化
        // 假設您的按鈕有 hover:opacity-100 之類的類別，這裡需要調整

    } else {
        // --- 恢復到原始狀態 ---

        // 1. 移除視覺反饋
        if (button.dataset.loadingClasses) {
            button.classList.remove(...button.dataset.loadingClasses.split(' '));
        }

        // 2. 恢復禁用狀態
        button.disabled = false;

        // 3. 恢復原始文本
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText; // 清除儲存，讓它在下一次點擊時再次儲存
        }
    }
}