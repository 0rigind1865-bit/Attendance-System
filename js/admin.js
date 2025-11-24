/**
Copyright (C) 2025 0J (Lin Jie / 0rigin1856)

This file is part of 0riginAttendance-System.

0riginAttendance-System is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 2 of the License, or
(at your option) any later version.

0riginAttendance-System is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with 0riginAttendance-System. If not, see <https://www.gnu.org/licenses/>.
Please credit "0J (Lin Jie / 0rigin1856)" when redistributing or modifying this project.
 */
// ===================================
// js/admin.js
// 依賴: state.js (adminMonthDataCache, DOM 元素), core.js, ui.js
// ===================================

// ===================================
// #region 1. 管理員日曆與紀錄渲染
// ===================================

/**
 * 渲染指定員工的日曆 (管理員專用)
 * 修正: 使用 state.js 中宣告的 DOM 變數
 * @param {string} userId - 要查詢的員工 userId
 * @param {Date} date - 要查詢的月份日期物件
 */
async function renderAdminCalendar(userId, date) {
    // 修正：使用全域變數 (來自 state.js 並在 app.js/getDOMElements 中賦值)
    // 之前錯誤地使用 document.getElementById，現已修正為全域變數：
    const monthTitle = adminCurrentMonthDisplay;
    const calendarGrid = adminCalendarGrid; // 假設您在 state.js 中宣告了 adminCalendarGrid

    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();

    const monthkey = `${userId}-${year}-${String(month + 1).padStart(2, "0")}`;

    if (adminMonthDataCache[monthkey]) {
        const records = adminMonthDataCache[monthkey];
        // renderCalendarWithData 來自 ui.js
        renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle, true);
    } else {
        calendarGrid.innerHTML = '<div data-i18n="LOADING" class="col-span-full text-center text-gray-500 py-4">正在載入...</div>';
        renderTranslations(calendarGrid); // 來自 core.js

        try {
            const monthStr = String(month + 1).padStart(2, "0");
            const monthKey = `${year}-${monthStr}`;

            const res = await callApifetch({
                action: 'getAttendanceDetails',
                month: monthKey,
                userId: userId // 參數名稱應與後端一致
            });

            if (res.ok) {
                adminMonthDataCache[monthkey] = res.records.dailyStatus;
                calendarGrid.innerHTML = '';
                const records = adminMonthDataCache[monthkey] || [];
                renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle, true);
                // 計算並顯示月總薪資
                console.log('Records:', records);  // 檢查 records 是否有資料
                console.log('Salary:', currentManagingEmployee.salary);  // 檢查薪資是否設定
                calculateAndDisplayMonthlySalary(records);
            } else {
                console.error("Failed to fetch admin attendance records:", res.msg);
                showNotification(res.msg || t("ERROR_FETCH_RECORDS"), "error"); // 來自 core.js
            }
        } catch (err) {
            console.error(err);
        }
    }
}

/**
 * 計算並顯示月總薪資 (包含計算過程)
 * @param {Array} records - 月份的所有每日記錄
 */
function calculateAndDisplayMonthlySalary(records) {
    const monthlySalary = currentManagingEmployee.salary || 28590; // 預設為2025最低月薪
    const hourlyRate = (monthlySalary / 240).toFixed(2); // 等效時薪
    let totalMonthlySalary = 0;
    let calculationDetails = []; // 儲存每日計算細節

    records.forEach(dailyRecord => {
        if (dailyRecord.hours > 0) {
            const { dailySalary, calculation } = calculateDailySalary(dailyRecord.hours, hourlyRate);
            totalMonthlySalary += dailySalary;
            calculationDetails.push(`日期 ${dailyRecord.date}: ${calculation}`);
        }
    });

    totalMonthlySalary = totalMonthlySalary.toFixed(2);

    // 顯示月總薪資 (假設有 adminMonthlySalaryDisplay 元素，在 state.js 中宣告)
    adminMonthlySalaryDisplay.innerHTML = `
        <p class="text-sm text-gray-500 dark:text-gray-400">
            <span data-i18n="MONTHLY_SALARY_PREFIX">本月總薪資：</span>
            ${totalMonthlySalary} NTD
        </p>
        <p class="text-xs text-gray-400 mt-1 italic">
            計算過程: ${calculationDetails.join('; ')}
        </p>
    `;
    renderTranslations(adminMonthlySalaryDisplay);
}

/**
 * 計算單日薪資 (考慮加班倍率)
 * @param {number} hours - 當日總時數
 * @param {number} hourlyRate - 等效時薪
 * @returns {Object} - { dailySalary: number, calculation: string }
 */
function calculateDailySalary(hours, hourlyRate) {
    let dailySalary = 0;
    let calculation = '';

    if (hours <= 8) {
        // 正常工時: 直接乘時數
        dailySalary = hourlyRate * hours;
        calculation = `${hourlyRate} × ${hours} = ${dailySalary.toFixed(2)}`;
    } else {
        // 正常8小時
        const normalPay = hourlyRate * 8;
        dailySalary += normalPay;
        calculation += `${hourlyRate} × 8 (正常) = ${normalPay.toFixed(2)}; `;

        let overtimeHours = hours - 8;
        // 加班前2小時: 1.33倍
        if (overtimeHours > 0) {
            const overtime1 = Math.min(overtimeHours, 2);
            const overtimePay1 = hourlyRate * overtime1 * 1.33;
            dailySalary += overtimePay1;
            calculation += `${hourlyRate} × ${overtime1} × 1.33 (前2小時加班) = ${overtimePay1.toFixed(2)}; `;
            overtimeHours -= overtime1;
        }
        // 加班後續小時: 1.66倍
        if (overtimeHours > 0) {
            const overtimePay2 = hourlyRate * overtimeHours * 1.66;
            dailySalary += overtimePay2;
            calculation += `${hourlyRate} × ${overtimeHours} × 1.66 (後續加班) = ${overtimePay2.toFixed(2)}; `;
        }
        calculation += `總計 = ${dailySalary.toFixed(2)}`;
    }

    return { dailySalary, calculation };
}

/**
 * 渲染管理員視圖中，某一天點擊後的打卡紀錄
 * @param {string} dateKey - 點擊的日期 (YYYY-MM-DD)
 * @param {string} userId - 管理員選定的員工 ID
 */
async function renderAdminDailyRecords(dateKey, userId) {
    // 確保使用全域變數，而非 document.getElementById
    adminDailyRecordsTitle.textContent = t("DAILY_RECORDS_TITLE", { dateKey: dateKey });

    adminDailyRecordsList.innerHTML = '';
    adminDailyRecordsEmpty.style.display = 'none';
    adminDailyRecordsCard.style.display = 'block';
    adminRecordsLoading.style.display = 'block';

    const dateObject = new Date(dateKey);
    const monthKey = dateObject.getFullYear() + "-" + String(dateObject.getMonth() + 1).padStart(2, "0");
    const adminCacheKey = `${userId}-${dateObject.getFullYear()}-${String(dateObject.getMonth() + 1).padStart(2, "0")}`;

    if (adminMonthDataCache[adminCacheKey]) {
        renderRecords(adminMonthDataCache[adminCacheKey]);
        adminRecordsLoading.style.display = 'none';
    } else {
        try {
            const res = await callApifetch({
                action: 'getAttendanceDetails',
                month: monthKey,
                targetUserId: userId
            }, 'admin-records-loading');

            adminRecordsLoading.style.display = 'none';

            if (res.ok) {
                adminMonthDataCache[adminCacheKey] = res.records.dailyStatus;
                renderRecords(res.records.dailyStatus);
            } else {
                console.error("Admin: Failed to fetch attendance records:", res.msg);
                showNotification(t("ERROR_FETCH_RECORDS"), "error");
            }
        } catch (err) {
            console.error(err);
        }
    }

    // 內部函式：渲染日紀錄列表
    function renderRecords(records) {
        const dailyRecords = records.filter(record => record.date === dateKey);

        // 清空現有列表
        adminDailyRecordsList.innerHTML = '';

        // 移除舊的 externalInfo（假設 className 為 'daily-summary' 以便識別）
        const existingSummaries = adminDailyRecordsList.parentNode.querySelectorAll('.daily-summary');
        existingSummaries.forEach(summary => summary.remove());

        if (dailyRecords.length > 0) {
            adminDailyRecordsEmpty.style.display = 'none';

            // 假設 dailyRecords 通常只有一個（單一日期），但以 forEach 處理可能多個
            dailyRecords.forEach(dailyRecord => {
                // 為每個打卡記錄創建獨立卡片
                dailyRecord.record.forEach(r => {
                    const li = document.createElement('li');
                    li.className = 'p-3 rounded-lg';

                    // 根據 type 設定不同顏色
                    if (r.type === '上班') {
                        li.classList.add('bg-blue-50', 'dark:bg-blue-700'); // 上班顏色（藍色系）
                    } else if (r.type === '下班') {
                        li.classList.add('bg-green-50', 'dark:bg-green-700'); // 下班顏色（綠色系）
                    } else {
                        li.classList.add('bg-gray-50', 'dark:bg-gray-700'); // 其他類型（灰色系）
                    }

                    // 根據 r.type 的值來選擇正確的翻譯鍵值
                    const typeKey = r.type === '上班' ? 'PUNCH_IN' : 'PUNCH_OUT';

                    // 產生單一打卡記錄的 HTML
                    li.innerHTML = `
                        <p class="font-medium text-gray-800 dark:text-white">${r.time} - ${t(typeKey)}</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">地點: ${r.location}</p>
                        <p data-i18n="RECORD_NOTE_PREFIX" class="text-sm text-gray-500 dark:text-gray-400">備註：${r.note}</p>
                    `;

                    adminDailyRecordsList.appendChild(li);
                    renderTranslations(li);  // 渲染翻譯
                });

                // 在卡片列表外部顯示系統判斷與時數
                const externalInfo = document.createElement('div');
                externalInfo.className = 'daily-summary mt-4 p-3 bg-gray-100 dark:bg-gray-600 rounded-lg';

                let hoursHtml = '';
                let salaryHtml = '';
                if (dailyRecord.hours > 0) {
                    hoursHtml = `
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            <span data-i18n="RECORD_HOURS_PREFIX">當日工作時數：</span>
                            ${dailyRecord.hours} 小時
                        </p>
                    `;
                    // 計算當日薪資 (使用 currentManagingEmployee.salary，假設已從員工選擇事件中設定)
                    const monthlySalary = currentManagingEmployee.salary || 28590; // 預設為2025最低月薪，如果無資料
                    const hourlyRate = (monthlySalary / 240).toFixed(2); // 等效時薪
                    const { dailySalary, calculation } = calculateDailySalary(dailyRecord.hours, hourlyRate); // 使用新函式

                    salaryHtml = `
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
                            <span data-i18n="RECORD_SALARY_PREFIX">當日薪資：</span>
                            ${dailySalary.toFixed(2)} NTD
                        </p>
                        <p class="text-xs text-gray-400 mt-1 italic">
                            計算式: ${calculation}
                        </p>
                    `;
                }

                externalInfo.innerHTML = `
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        <span data-i18n="RECORD_REASON_PREFIX">系統判斷：</span>
                        ${t(dailyRecord.reason)}
                    </p>
                    ${hoursHtml}
                    ${salaryHtml}
                `;
                // append 到 adminDailyRecordsList 後面
                adminDailyRecordsList.parentNode.appendChild(externalInfo);
                renderTranslations(externalInfo);  // 渲染翻譯
            });
        } else {
            adminDailyRecordsEmpty.style.display = 'block';
        }
        adminRecordsLoading.style.display = 'none';
    }
}
// #endregion

// ===================================
// #region 2. 待審核請求與審批
// ===================================

/**
 * 取得並渲染所有待審核的請求。
 */
async function fetchAndRenderReviewRequests() {
    // 修正：使用全域變數 (來自 state.js 並在 app.js/getDOMElements 中賦值)
    const loadingEl = requestsLoading;
    const emptyEl = requestsEmpty;
    const listEl = pendingRequestsList; // 假設您在 state.js 中正確宣告了這些變數

    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';
    listEl.innerHTML = '';

    try {
        const res = await callApifetch({ action: 'getReviewRequest' }); // 來自 core.js
        if (res.ok && Array.isArray(res.reviewRequest)) {
            pendingRequests = res.reviewRequest; // 來自 state.js

            if (pendingRequests.length === 0) {
                emptyEl.style.display = 'block';
            } else {
                renderReviewRequests(pendingRequests);
            }
        } else {
            showNotification("取得待審核請求失敗：" + res.msg, "error"); // 來自 core.js
            emptyEl.style.display = 'block';
        }
    } catch (error) {
        showNotification("取得待審核請求失敗，請檢查網路。", "error");
        emptyEl.style.display = 'block';
        console.error("Failed to fetch review requests:", error);
    } finally {
        loadingEl.style.display = 'none';
    }
}

/**
 * 根據資料渲染待審核列表。
 * 修正: 使用全域變數 pendingRequestsList
 * @param {Array<Object>} requests - 請求資料陣列。
 */
function renderReviewRequests(requests) {
    const listEl = pendingRequestsList; // 修正：使用全域變數
    listEl.innerHTML = '';

    requests.forEach((req, index) => {
        const li = document.createElement('li');
        li.className = 'p-4 bg-gray-50 rounded-lg shadow-sm flex flex-col space-y-2 dark:bg-gray-700';
        // ... (HTML 結構不變) ...
        li.innerHTML = `
             <div class="flex flex-col space-y-1">

                        <div class="flex items-center justify-between w-full">
                            <p class="text-sm font-semibold text-gray-800 dark:text-white">${req.name} - ${req.remark}</p>
                            <span class="text-xs text-gray-500">${req.applicationPeriod}</span>
                        </div>
                    </div>
                    
                <div class="flex items-center justify-between w-full mt-2">
                    <p 
                        data-i18n-key="${req.type}" 
                        class="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                    </p> 
                    
                    <div class="flex space-x-2"> 
                        <button data-i18n="ADMIN_APPROVE_BUTTON" data-index="${index}" class="approve-btn px-3 py-1 rounded-md text-sm font-bold btn-primary">核准</button>
                        <button data-i18n="ADMIN_REJECT_BUTTON" data-index="${index}" class="reject-btn px-3 py-1 rounded-md text-sm font-bold btn-warning">拒絕</button>
                    </div>
                </div>
            `;
        listEl.appendChild(li);
        renderTranslations(li); // 來自 core.js
    });

    // 事件綁定 (審批動作)
    listEl.querySelectorAll('.approve-btn').forEach(button => {
        button.addEventListener('click', (e) => handleReviewAction(e.currentTarget, e.currentTarget.dataset.index, 'approve'));
    });

    listEl.querySelectorAll('.reject-btn').forEach(button => {
        button.addEventListener('click', (e) => handleReviewAction(e.currentTarget, e.currentTarget.dataset.index, 'reject'));
    });
}

/**
 * 處理審核動作（核准或拒絕）。
 */
async function handleReviewAction(button, index, action) {
    const request = pendingRequests[index]; // 來自 state.js
    // ... (錯誤檢查與 API 呼叫邏輯與您提供的相同) ...

    const recordId = request.id;
    const endpoint = action === 'approve' ? 'approveReview' : 'rejectReview';
    const loadingText = t('LOADING') || '處理中...';

    // generalButtonState 來自 ui.js
    generalButtonState(button, 'processing', loadingText);

    try {
        const res = await callApifetch({
            action: endpoint,
            id: recordId
        });
        if (res.ok) {
            const translationKey = action === 'approve' ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED';
            showNotification(t(translationKey), "success");
            await new Promise(resolve => setTimeout(resolve, 500));
            // 成功後重新整理列表
            fetchAndRenderReviewRequests();
        } else {
            showNotification(t('REVIEW_FAILED', { msg: res.msg }), "error");
        }
    } catch (err) {
        showNotification(t("REVIEW_NETWORK_ERROR"), "error");
        console.error(err);
    } finally {
        generalButtonState(button, 'idle'); // generalButtonState 來自 ui.js
    }
}
// #endregion

// ===================================
// #region 3. 員工列表與管理員初始化
// ===================================

/**
 * 載入員工列表 (新增一個 GAS 函式來獲取所有員工)
 * 修正: 使用全域變數 adminSelectEmployee
 */
async function loadEmployeeList() {
    const loadingId = "loading-employees";

    try {
        const data = await callApifetch({ action: 'getEmployeeList' }, loadingId);
        if (data && data.ok === true) {
            const employees = data.employeesList;
            allEmployeeList = employees; // 儲存員工列表 (來自 state.js)

            // 清空並填充下拉菜單 (使用全域變數)
            adminSelectEmployee.innerHTML = '<option value="">-- 請選擇一位員工 --</option>';
            employees.forEach(employee => {
                const option = document.createElement('option');
                option.value = employee.userId;
                option.textContent = `${employee.name} (${employee.userId.substring(0, 8)}...)`;
                adminSelectEmployee.appendChild(option);
            });
            // 清空並填充下拉菜單 (使用全域變數)
            adminSelectEmployeeMgmt.innerHTML = '<option value="">-- 請選擇一位員工 --</option>';
            employees.forEach(employee => {
                const option = document.createElement('option');
                option.value = employee.userId;
                option.textContent = `${employee.name} (${employee.userId.substring(0, 8)}...)`;
                adminSelectEmployeeMgmt.appendChild(option);
            });
        } else {
            console.error("載入員工列表時 API 回傳失敗:", data.message);
            showNotification(data.message || t("FAILED_TO_LOAD_EMPLOYEES"), "error");
        }
    } catch (e) {
        console.error("loadEmployeeList 呼叫流程錯誤:", e);
    }
}


/**
 * 設置待審核請求區塊的收合/展開功能。
 */
function setupRequestToggle() {
    // 修正：使用全域變數 (來自 state.js 並在 app.js/getDOMElements 中賦值)
    const toggleButton = toggleRequestsBtn;
    const contentDiv = pendingRequestsContent;
    const iconSpan = toggleRequestsIcon; // 假設您在 state.js 中宣告了這些變數

    if (!toggleButton || !contentDiv || !iconSpan) {
        return;
    }

    function toggleCollapse() {
        // ... (收合/展開邏輯與您提供的相同) ...
        contentDiv.classList.toggle('hidden');

        if (contentDiv.classList.contains('hidden')) {
            toggleButton.classList.add('rotate-180');
        } else {
            toggleButton.classList.remove('rotate-180');
        }
    }

    toggleButton.addEventListener('click', toggleCollapse);
}


/**
 * 統一管理員頁面事件的綁定
 */
function initAdminEvents() {
    // 1. 處理員工選擇事件
    adminSelectEmployee.addEventListener('change', async (e) => {

        adminSelectedUserId = e.target.value; // 來自 state.js
        currentManagingEmployee = allEmployeeList.find(emp => emp.userId === adminSelectedUserId);;

        if (adminSelectedUserId) {
            adminEmployeeCalendarCard.style.display = 'block';
            await renderAdminCalendar(adminSelectedUserId, adminCurrentDate); // 來自 state.js
        } else {
            adminEmployeeCalendarCard.style.display = 'none';
        }
    });

    // 1. 處理員工選擇事件
    adminSelectEmployeeMgmt.addEventListener('change', async (e) => {
        const selectedUserId = e.target.value;
        const employee = allEmployeeList.find(emp => emp.userId === selectedUserId);
        if (employee) {
            // 修正屬性名稱：src 和您的資料屬性
            mgmtEmployeeName.textContent = employee.name;
            mgmtEmployeeId.textContent = employee.userId;
            const joinTimeSource = employee.firstLoginTime;
            if (joinTimeSource) {
                const joinDate = new Date(joinTimeSource);
                // 假設 currentLang 已經定義 (在 state.js 中)
                const formattedDate = joinDate.toLocaleDateString(currentLang, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
                const formattedTime = joinDate.toLocaleTimeString(currentLang, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false // 使用 24 小時制
                });
                mgmtEmployeeJoinDate.textContent = `${formattedDate} ${formattedTime}`;
                const today = new Date();

                // 計算總月份數 (更精確的年資計算方法)
                const totalMonths = (today.getFullYear() - joinDate.getFullYear()) * 12 + (today.getMonth() - joinDate.getMonth());

                let years = Math.floor(totalMonths / 12);
                let months = totalMonths % 12;

                // 如果當前日期比入職日期的當月日期早，則月份減一
                if (today.getDate() < joinDate.getDate()) {
                    months--;
                    if (months < 0) {
                        months += 12;
                        years--;
                    }
                }

                let seniorityText = '';
                if (years > 0) seniorityText += `${years} ${t("YEAR") || '年'}`;
                // 只有當月份 > 0 或者總年資不到一年時才顯示月份
                if (months > 0 || (years === 0 && months === 0)) seniorityText += `${months} ${t("MONTH") || '個月'}`;

                mgmtEmployeeSeniority.textContent = seniorityText.trim() || 'N/A';
            } else {
                mgmtEmployeeJoinDate.textContent = 'N/A';
                mgmtEmployeeSeniority.textContent = 'N/A';
            }

            mgmtEmployeeAvatar.src = employee.picture || '預設頭像 URL';
            salaryValueSpan.innerText = employee.salary || 60;
            basicSalaryInput.value = employee.salary || 0;
            if (employee.status === "啟用")
                toggleActive.checked = true;
            else
                toggleActive.checked = false;

            if (employee.position === "管理員")
                toggleAdmin.checked = true;
            else
                toggleAdmin.checked = false;

            employeeDetailCard.style.display = 'block';
            mgmtPlaceholder.style.display = 'none';
        } else {
            // 處理未選擇或找不到的情況
            employeeDetailCard.style.display = 'none';
            mgmtPlaceholder.style.display = 'block';
        }
    });

    // 2. 處理月份切換事件
    adminPrevMonthBtn.addEventListener('click', () => {
        adminCurrentDate.setMonth(adminCurrentDate.getMonth() - 1);
        if (adminSelectedUserId) {
            renderAdminCalendar(adminSelectedUserId, adminCurrentDate);
        }
    });

    adminNextMonthBtn.addEventListener('click', () => {
        adminCurrentDate.setMonth(adminCurrentDate.getMonth() + 1);
        if (adminSelectedUserId) {
            renderAdminCalendar(adminSelectedUserId, adminCurrentDate);
        }
    });

    // 3. 設置待審核請求收合功能
    setupRequestToggle();

    // 4. 地點新增功能（管理員專用）
    getLocationBtn.addEventListener('click', () => {
        // ... (您提供的定位邏輯) ...
        if (!navigator.geolocation) {
            showNotification(t("ERROR_GEOLOCATION", { msg: t('ERROR_BROWSER_NOT_SUPPORTED') }), "error");
            return;
        }

        // 修正：使用全域變數
        getLocationBtn.textContent = '取得中...';
        getLocationBtn.disabled = true;

        navigator.geolocation.getCurrentPosition((pos) => {
            locationLatInput.value = pos.coords.latitude;
            locationLngInput.value = pos.coords.longitude;
            getLocationBtn.textContent = '已取得';
            addLocationBtn.disabled = false;
            showNotification("位置已成功取得！", "success");
        }, (err) => {
            showNotification(t("ERROR_GEOLOCATION", { msg: err.message }), "error");
            getLocationBtn.textContent = '取得當前位置';
            getLocationBtn.disabled = false;
        });
    });

    // 5. 處理新增打卡地點
    addLocationBtn.addEventListener('click', async () => {
        const name = locationName.value; // 假設您有宣告 locationName
        const lat = locationLatInput.value;
        const lng = locationLngInput.value;

        if (!name || !lat || !lng) {
            showNotification("請填寫所有欄位並取得位置", "error");
            return;
        }

        try {
            const res = await callApifetch({
                action: 'addLocation',
                name: name,
                lat: encodeURIComponent(lat),
                lng: encodeURIComponent(lng)
            });
            if (res.ok) {
                showNotification("地點新增成功！", "success");
                // 清空輸入欄位
                locationName.value = ''; // 假設您有宣告 locationName
                locationLatInput.value = '';
                locationLngInput.value = '';
                // 重設按鈕狀態
                getLocationBtn.textContent = '取得當前位置';
                getLocationBtn.disabled = false;
                addLocationBtn.disabled = true;
            } else {
                showNotification("新增地點失敗：" + res.msg, "error");
            }
        } catch (err) {
            console.error(err);
        }
    });
}

/**
 * 管理員儀表板的總啟動函式 (供 app.js 呼叫)
 */
async function loadAdminDashboard() {
    // 確保 adminEventsBound 在 state.js 中被宣告為 let adminEventsBound = false;
    if (!adminEventsBound) {
        initAdminEvents();
        adminEventsBound = true;
    }

    // 1. 載入員工列表並填充下拉選單
    await loadEmployeeList();

    // 2. 載入待審核請求
    await fetchAndRenderReviewRequests();
}
// #endregion

// ===================================
// #region 4. API 測試（通用但為開發目的，可放在 core.js 或 app.js/bindEvents）
// 這裡暫時保留在 admin.js，但建議移動到 app.js/bindEvents
// ===================================

document.getElementById('test-api-btn').addEventListener('click', async () => {
    const testAction = "testEndpoint";
    try {
        const res = await callApifetch({ action: testAction });
        if (res && res.ok) {
            showNotification("API 測試成功！回應：" + JSON.stringify(res), "success");
        } else {
            showNotification("API 測試失敗：" + (res ? res.msg : "無回應資料"), "error");
        }
    } catch (error) {
        console.error("API 呼叫發生錯誤:", error);
        showNotification("API 呼叫失敗，請檢查網路連線或後端服務。", "error");
    }
});
// #endregion
// ===================================

// ===================================
// #region 5. 管理員子頁籤切換邏輯
// ===================================
/**
 * 切換管理員頁面內的子頁籤 (Admin Sub-Tab Switcher)
 * @param {string} subTabId - 要切換到的子頁籤 ID (例如: 'review-requests')
 */

const switchAdminSubTab = (subTabId) => {
    const subTabs = ['employee-mgmt-view', 'punch-mgmt-view', 'form-review-view', 'scheduling-view'];
    const subBtns = ['tab-employee-mgmt-btn', 'tab-punch-mgmt-btn', 'tab-form-review-btn', 'tab-scheduling-btn'];

    // 1. 移除所有子頁籤內容的顯示
    subTabs.forEach(id => {
        const tabElement = document.getElementById(id);
        if (tabElement) {
            tabElement.style.display = 'none';
        }
    });

    subBtns.forEach(id => {
        const btnElement = document.getElementById(id);
        btnElement.classList.replace('bg-indigo-600', 'bg-gray-200');
        btnElement.classList.replace('text-white', 'text-gray-600');
    });

    // 3. 顯示新頁籤並新增 active 類別
    const newTabElement = document.getElementById(subTabId);
    newTabElement.style.display = 'block'; // 顯示內容

    // 4. 設定新頁籤按鈕的選中狀態
    const newBtnElement = document.getElementById(`tab-${subTabId.replace('-view', '-btn')}`);
    newBtnElement.classList.replace('bg-gray-200', 'bg-indigo-600');
    newBtnElement.classList.replace('text-gray-600', 'text-white');

    // 5. 根據子頁籤 ID 執行特定動作 (例如：載入資料)
    console.log(`切換到管理員子頁籤: ${subTabId}`);
    if (subTabId === 'review-requests') {
        fetchAndRenderReviewRequests(); // 載入表單
    } else if (subTabId === 'manage-Punch') {
        // renderLocationManagement(); // 待實現
        console.log('載入打卡管理介面...');
    } else if (subTabId === 'manage-users') {
        // renderUserManagement(); // 待實現
        console.log('載入員工帳號管理介面...');
    }
};
// #endregion
// ===================================