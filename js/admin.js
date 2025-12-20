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
    // 1. 取得全域 DOM 元素 (建議加上防呆檢查)
    const monthTitle = adminCurrentMonthDisplay;
    const calendarGrid = adminCalendarGrid;

    if (!monthTitle || !calendarGrid) {
        console.error("DOM Elements (adminCurrentMonthDisplay or adminCalendarGrid) not found.");
        return;
    }

    // 2. 準備日期與參數
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();

    // 統一格式：YYYY-MM (API用) 與 UserId-YYYY-MM (快取用)
    const monthStr = String(month + 1).padStart(2, "0");
    const apiMonthParam = `${year}-${monthStr}`;
    const cacheKey = `${userId}-${year}-${monthStr}`;

    // 定義一個內部函式來執行 UI 更新 (避免重複程式碼)
    const updateCalendarUI = (records) => {
        // 清空並渲染日曆 (renderCalendarWithData 來自 ui.js)
        // 注意：calendarGrid.innerHTML 在 renderCalendarWithData 內部通常會被處理，
        // 但若該函式是 append 模式，則需先手動清空 calendarGrid.innerHTML = '';
        calendarGrid.innerHTML = '';

        renderCalendarWithData(year, month, today, records, calendarGrid, monthTitle, true);

        // 加入星期標籤 (必須在格子生成後執行)
        _addWeekdayLabelsToAdminCalendar(year, month);

        // 計算並顯示月總薪資
        // console.log('Records:', records, 'Salary:', currentManagingEmployee?.salary);
        calculateAndDisplayMonthlySalary(records);
    };

    // 3. 邏輯分支：檢查快取 vs API 請求
    if (adminMonthDataCache[cacheKey]) {
        // --- 情境 A: 快取有資料 ---
        console.log(`[Cache Hit] Loading data for ${cacheKey}`);
        updateCalendarUI(adminMonthDataCache[cacheKey]);

    } else {
        // --- 情境 B: 無快取，需請求 API ---

        // 顯示 Loading 狀態
        calendarGrid.innerHTML = '<div data-i18n="LOADING" class="col-span-full text-center text-gray-500 py-4">正在載入...</div>';
        if (typeof renderTranslations === 'function') renderTranslations(calendarGrid);

        try {
            const res = await callApifetch({
                action: 'getAttendanceDetails',
                month: apiMonthParam,
                userId: userId
            });

            if (res.ok) {
                // 儲存至快取
                const records = res.records.dailyStatus || [];
                adminMonthDataCache[cacheKey] = records;

                // 更新 UI
                updateCalendarUI(records);
            } else {
                // API 回傳錯誤
                console.error("Failed to fetch admin attendance records:", res.msg);
                calendarGrid.innerHTML = `<div class="col-span-full text-center text-red-500 py-4">${res.msg || '無法載入資料'}</div>`;
                showNotification(res.msg || t("ERROR_FETCH_RECORDS"), "error");
            }
        } catch (err) {
            // 網路或系統錯誤
            console.error("System Error in renderAdminCalendar:", err);
            calendarGrid.innerHTML = '<div class="col-span-full text-center text-red-500 py-4">發生系統錯誤</div>';
        }
    }
}

/**
 * 計算並顯示月總薪資 (包含計算過程，特別標註扣除的休息時間)
 * @param {Array} records - 月份的所有每日記錄 (要求包含 punchInTime, punchOutTime 欄位)
 */
function calculateAndDisplayMonthlySalary(records) {
    // 檢查全域變數是否存在，如果不存在，提供合理的預設值
    const monthlySalary = (typeof currentManagingEmployee !== 'undefined' && currentManagingEmployee.salary)
        ? currentManagingEmployee.salary
        : 30000; // 預設為2025最低月薪

    let hourlyRate = (monthlySalary / 240); // 確保是數字進行計算
    const hourlyRateDisplay = hourlyRate.toFixed(2);

    let totalMonthlyOvertimeSalary = 0;
    let calculationDetails = []; // 儲存每日計算細節
    let totalNormalHours = 0;//此月正常工時
    let totalOvertimeHours = 0;//此月加班工時：
    let totalNetHours = 0;//此月總淨工時：
    let totalRestHours = 0;//此月休息時數：
    let totalGrossHours = 0;//此月總時數：
    records.forEach(dailyRecord => {
        // 確保有打卡時間欄位才計算
        if (dailyRecord.punchInTime && dailyRecord.punchOutTime) {
            // 判斷日子類型 
            const dateObject = new Date(dailyRecord.date);

            // 檢查轉換是否成功，避免轉換失敗時繼續執行
            if (isNaN(dateObject)) {
                console.error(`日期格式錯誤，無法轉換: ${dailyRecord.date}`);
                return; // 跳過此筆紀錄
            }

            const dayOfWeek = dateObject.getDay(); // 0=週日, 6=週六

            const isNationalHoliday = dailyRecord.isHoliday || false;

            const dayType = determineDayType(dayOfWeek, isNationalHoliday);
            //console.log(`計算日期: ${dailyRecord.date},dayOfWeek:${dayOfWeek}, 類型: ${dayType}`);
            // 🚨 步驟 1：使用新函數計算淨工時與扣除分鐘數
            const {
                dailySalary,
                calculation,
                effectiveHours,
                totalBreakMinutes,
                laborHoursDetails,
            } = calculateDailySalaryFromPunches(
                dailyRecord.punchInTime,
                dailyRecord.punchOutTime,
                hourlyRate,
                dayType
            );
            console.log(laborHoursDetails);
            totalNormalHours = totalNormalHours + laborHoursDetails.normalHours;
            totalOvertimeHours = totalOvertimeHours + laborHoursDetails.overtimeHours;
            totalNetHours = totalNormalHours + totalOvertimeHours;
            totalRestHours = totalRestHours + laborHoursDetails.restHours;
            totalGrossHours = totalNetHours + totalRestHours;
            // 格式化扣除的休息時間
            const breakHoursDisplay = (totalBreakMinutes / 60).toFixed(2);

            if (effectiveHours > 0) {
                totalMonthlyOvertimeSalary += dailySalary;
                const effectiveHoursFixed = effectiveHours.toFixed(2);
                calculationDetails.push(
                    `日期 ${dailyRecord.date} (${dailyRecord.punchInTime}-${dailyRecord.punchOutTime}): 
                     - 休息扣除 ${breakHoursDisplay}h (淨工時 ${effectiveHoursFixed}h)
                     - 加班計算: ${calculation}`
                );
            } else if (totalBreakMinutes > 0) {
                // 記錄打卡了，但全被休息時間扣除的情況
                calculationDetails.push(
                    `日期 ${dailyRecord.date} (${dailyRecord.punchInTime}-${dailyRecord.punchOutTime}): 
                     - 休息扣除 ${breakHoursDisplay}h (淨工時 0h, 無薪資)`
                );
            }
        }
    });

    totalMonthlyOvertimeSalary = totalMonthlyOvertimeSalary.toFixed(2);

    // 顯示月總薪資
    const displayElement = document.getElementById('admin-monthly-salary-display');
    const targetDisplay = (typeof adminMonthlySalaryDisplay !== 'undefined') ? adminMonthlySalaryDisplay : displayElement;
    let totalMonthlySalary = (
        +monthlySalary +
        +totalMonthlyOvertimeSalary
    ).toFixed(2);
    if (targetDisplay) {
        targetDisplay.innerHTML = `
            <p class="text-sm text-gray-500 dark:text-gray-400">
                <span data-i18n="MONTHLY_SALARY_PREFIX">本月總薪資：</span>
                <span class="text-lg font-bold text-indigo-600 dark:text-indigo-400">${totalMonthlySalary} NTD</span>
            </p>
            <p class="text-xs text-gray-400 mt-1 italic">
                <span data-i18n="HOURLY_RATE_CALCULATED">月薪：</span> ${monthlySalary} NTD
            </p>
            <p class="text-xs text-gray-400 mt-1 italic">
                <span data-i18n="HOURLY_RATE_CALCULATED">等效時薪：</span> ${hourlyRateDisplay} NTD/小時
            </p>
                 <p class="text-xs text-gray-400 mt-1 italic">
                <span data-i18n="HOURLY_RATE_CALCULATED">此月加班總薪資：</span> ${totalMonthlyOvertimeSalary} NTD
            </p>
            </p>
                 <p class="text-xs text-gray-400 mt-1 italic">
                <span data-i18n="HOURLY_RATE_CALCULATED">此月正常工時：</span> ${totalNormalHours} Hr
            </p>
            </p>
                 <p class="text-xs text-gray-400 mt-1 italic">
                <span data-i18n="HOURLY_RATE_CALCULATED">此月加班工時：</span> ${totalOvertimeHours} Hr
            </p>
            </p>
                 <p class="text-xs text-gray-400 mt-1 italic">
                <span data-i18n="HOURLY_RATE_CALCULATED">此月總淨工時：</span> ${totalNetHours} Hr
            </p>
            </p>
                 <p class="text-xs text-gray-400 mt-1 italic">
                <span data-i18n="HOURLY_RATE_CALCULATED">此月休息時數：</span> ${totalRestHours} Hr
            </p>
                        </p>
                 <p class="text-xs text-gray-400 mt-1 italic">
                <span data-i18n="HOURLY_RATE_CALCULATED">此月總時數：</span> ${totalGrossHours} Hr
            </p>
            <details class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <summary>計算細節 (點擊展開)</summary>
                <ul class="list-disc ml-4 mt-1 space-y-0.5">
                    ${calculationDetails.map(detail => `<li>${detail}</li>`).join('')}
                </ul>
            </details>
        `;
        // 如果您的 i18n 系統需要
        if (typeof renderTranslations === 'function') {
            renderTranslations(targetDisplay);
        }
    }
}
/**
 * 根據上班與下班時間，計算扣除休息時間後的有效工時 (小時)，並回傳被扣除的總分鐘數。
 *
 * @param {string} punchInTime - 上班打卡時間，格式 'HH:MM' (例如 '08:30')
 * @param {string} punchOutTime - 下班打卡時間，格式 'HH:MM' (例如 '17:30')
 * @returns {Object} { effectiveHours: number, totalBreakMinutes: number }
 */
function calculateEffectiveHours(punchInTime, punchOutTime) {
    // 休息時間定義 (格式: [開始時間, 結束時間]，皆為 'HH:MM')
    const breakTimes = [
        ['06:00', '06:30'], // 早餐
        ['12:00', '13:00'], // 午餐
        ['19:00', '19:30']  // 晚餐
    ];

    // 輔助函數：將 'HH:MM' 轉換為當天的分鐘數
    const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    };

    // 輔助函數：計算兩個時間段的重疊分鐘數
    const getOverlapMinutes = (start1, end1, start2, end2) => {
        const latestStart = Math.max(start1, start2);
        const earliestEnd = Math.min(end1, end2);
        return Math.max(0, earliestEnd - latestStart);
    };

    const inMinutes = timeToMinutes(punchInTime);
    const outMinutes = timeToMinutes(punchOutTime);

    // 無效打卡 (下班早於上班)，返回 0
    if (outMinutes <= inMinutes) {
        return { effectiveHours: 0, totalBreakMinutes: 0 };
    }

    let totalDurationMinutes = outMinutes - inMinutes; // 總分鐘數
    let totalBreakMinutes = 0; // 應扣除的休息分鐘數

    // 計算重疊的休息時間
    breakTimes.forEach(breakPeriod => {
        const [breakStart, breakEnd] = breakPeriod;
        const breakStartMinutes = timeToMinutes(breakStart);
        const breakEndMinutes = timeToMinutes(breakEnd);

        const overlap = getOverlapMinutes(
            inMinutes,
            outMinutes,
            breakStartMinutes,
            breakEndMinutes
        );

        totalBreakMinutes += overlap;
    });

    // 實際應計薪的總分鐘數
    const effectiveMinutes = totalDurationMinutes - totalBreakMinutes;

    // 轉換為小時並保留兩位小數
    const effectiveHours = parseFloat(Math.max(0, effectiveMinutes / 60).toFixed(2));

    return { effectiveHours, totalBreakMinutes }; // 回傳物件
}

/**
 * 計算單日薪資 (符合勞動部一例一休規則)
 * @param {number} hours - 當日淨工時 (已扣除休息時間)
 * @param {number} hourlyRate - 等效時薪
 * @param {string} dayType - 日子類型 (來自 DAY_TYPE 常數)
 * @returns {Object} - { dailySalary: number, calculation: string }
 */
function calculateDailySalary(hours, hourlyRate, dayType) {
    let dailySalary = 0;
    let calculation = '';
    const NORMAL_WORK_HOURS = 8;
    // --- 🆕 初始化時數細節 ---
    const dailyHours = {
        normalHours: 0,   // 屬於法定正常工時 (平日前 8 小時)
        overtimeHours: 0, // 加班工時 (平日 >8h, 休息日所有時數)
        restHours: 0,     // 休息時數 (來自 calculateEffectiveHours 傳入)
        netHours: hours   // 淨工時 (總計薪時數)
    };

    // -------------------------
    // 如果 hours <= 0，直接返回 0
    if (hours <= 0) {
        return { dailySalary: 0, calculation: '淨工時 0h，無薪資' };
    }

    if (dayType === DAY_TYPE.REGULAR_OFF) {
        // =========================================================
        // 例假日 (週日) 計算 (不得要求出勤，違者重罰)
        // 假設：此出勤為合法，工資照給 + 額外一日工資。
        // 計薪公式：(8小時) × 2倍 + (超過8小時) × 2.66倍
        // =========================================================
        dailyHours.overtimeHours = hours; // 例假日出勤，所有工時皆為加班性質（特休/例假性質）
        // 額外發給的工資（不論工時長短，至少給予一日工資，即 8 小時薪資）
        const extraPay = hourlyRate * 8;
        dailySalary += extraPay;
        calculation += `${hourlyRate} × 8 (不論工時長短，至少給予一日工資，即 8 小時薪資) = ${extraPay.toFixed(2)}; `;

        let hWorked = hours;
        let hOver8 = Math.max(0, hWorked - 8);

        // 例假日超時部分（超 8 小時）：按2倍 計
        if (hOver8 > 0) {
            const payOver = hourlyRate * hOver8 * 2;
            dailySalary += payOver;
            calculation += `${hourlyRate} × ${hOver8} × 2 (例假日 >8h 加班) = ${payOver.toFixed(2)}; `;
        }
        // 例假日上班補休一天-折現
        dailySalary += extraPay;
        calculation += `${hourlyRate} × 8 (例假日上班補休一天-折現) = ${extraPay.toFixed(2)}; `;
    } else if (dayType === DAY_TYPE.HOLIDAY) {
        // =========================================================
        // 國定假日 (特別休假) 計算
        // =========================================================
        dailyHours.overtimeHours = hours; // 例假日出勤，所有工時皆為加班性質（特休/例假性質）
        if (hours <= 8) {
            dailySalary = hourlyRate * 8;
            calculation = `${hourlyRate} × ${8} (國定假日-不論工時長短，至少給予一日工資，即 8 小時薪資) = ${dailySalary.toFixed(2)}`;
        } else {
            const normalPay = hourlyRate * 8;
            dailySalary += normalPay;
            calculation += `${hourlyRate} × 8 (國定假日) = ${normalPay.toFixed(2)}; `;

            let overtimeHours = hours - 8;

            // 加班前 2 小時: 1.33 倍 (4/3)
            if (overtimeHours > 0) {
                const overtime1 = Math.min(overtimeHours, 2);
                const overtimePay1 = hourlyRate * overtime1 * 4 / 3;
                dailySalary += overtimePay1;
                calculation += `${hourlyRate} × ${overtime1} × 4/3 (國定假日加班 1-2h) = ${overtimePay1.toFixed(2)}; `;
                overtimeHours -= overtime1;
            }
            // 加班後續小時: 1.66 倍 (5/3)
            if (overtimeHours > 0) {
                const overtimePay2 = hourlyRate * overtimeHours * 5 / 3;
                dailySalary += overtimePay2;
                calculation += `${hourlyRate} × ${overtimeHours} × 5/3 (國定假日加班 >2h) = ${overtimePay2.toFixed(2)}; `;
            }
        }
    } else if (dayType === DAY_TYPE.REST_DAY) {
        // =========================================================
        // 休息日 (週六) 加班計算 (勞基法 §24 II)
        // 薪資基數：前 2h: 4/3；接著 6h: 5/3；超過 8h: 8/3。
        // =========================================================
        dailyHours.overtimeHours = hours; // 例假日出勤，所有工時皆為加班性質（特休/例假性質）
        let remainingHours = hours;

        // 1. 前 2 小時: 1.33 倍 (4/3)
        if (remainingHours > 0) {
            const h = Math.min(remainingHours, 2);
            const pay = hourlyRate * h * 4 / 3;
            dailySalary += pay;
            calculation += `${hourlyRate} × ${h} × 4/3 (休息日 1-2h) = ${pay.toFixed(2)}; `;
            remainingHours -= h;
        }

        // 2. 接著 6 小時 (總時數 3-8h): 1.66 倍 (5/3)
        if (remainingHours > 0) {
            const h = Math.min(remainingHours, 6);
            const pay = hourlyRate * h * 5 / 3;
            dailySalary += pay;
            calculation += `${hourlyRate} × ${h} × 5/3 (休息日 3-8h) = ${pay.toFixed(2)}; `;
            remainingHours -= h;
        }

        // 3. 超過 8 小時: 2.66 倍 (8/3)
        if (remainingHours > 0) {
            const h = remainingHours;
            const pay = hourlyRate * h * 8 / 3;
            dailySalary += pay;
            calculation += `${hourlyRate} × ${h} × 8/3 (休息日 >8h) = ${pay.toFixed(2)}; `;
        }
    } else {
        // =========================================================
        // 平日/工作日 加班計算 (原邏輯，勞基法 §24 I)
        // =========================================================
        let normalHours = Math.min(hours, NORMAL_WORK_HOURS);
        let overtimeHours = Math.max(0, hours - NORMAL_WORK_HOURS);

        dailyHours.normalHours = normalHours;
        dailyHours.overtimeHours = overtimeHours;

        overtimeHours = hours - normalHours;

        // 加班前 2 小時: 1.33 倍 (4/3)
        if (overtimeHours > 0) {
            const overtime1 = Math.min(overtimeHours, 2);
            const overtimePay1 = hourlyRate * overtime1 * 4 / 3;
            dailySalary += overtimePay1;
            calculation += `${hourlyRate} × ${overtime1} × 4/3 (平日加班 1-2h) = ${overtimePay1.toFixed(2)}; `;
            overtimeHours -= overtime1;
        }
        // 加班後續小時: 1.66 倍 (5/3)
        if (overtimeHours > 0) {
            const overtimePay2 = hourlyRate * overtimeHours * 5 / 3;
            dailySalary += overtimePay2;
            calculation += `${hourlyRate} × ${overtimeHours} × 5/3 (平日加班 >2h) = ${overtimePay2.toFixed(2)}; `;
        }

    }

    // 將總計加入 calculation 字串
    if (calculation && !calculation.includes('總計')) {
        calculation += `總計 = ${dailySalary.toFixed(2)}`;
    }

    return {
        dailySalary: parseFloat(dailySalary.toFixed(2)), calculation,
        laborHoursDetails: dailyHours
    };
}
/**
 * 🆕 專門用於處理「原始打卡時間」並計算單日薪資的函式。
 * 此函式確保計算前會扣除休息時間。
 *
 * @param {string} punchInTime - 上班打卡時間，格式 'HH:MM'
 * @param {string} punchOutTime - 下班打卡時間，格式 'HH:MM'
 * @param {number} hourlyRate - 等效時薪 (數字)
 * @returns {Object} 包含所有細節的物件：{ dailySalary, calculation, effectiveHours, totalBreakMinutes }
 */
function calculateDailySalaryFromPunches(punchInTime, punchOutTime, hourlyRate, dayType) {
    // 1. 計算淨工時與休息扣除時間
    const { effectiveHours, totalBreakMinutes } = calculateEffectiveHours(punchInTime, punchOutTime);

    // 🌟 預先計算休息小時數 🌟
    const restHours = parseFloat((totalBreakMinutes / 60).toFixed(2));

    let result = {
        dailySalary: 0,
        calculation: '',
        effectiveHours: effectiveHours,
        totalBreakMinutes: totalBreakMinutes,
        // 預設的工時細節 (如果沒有 effectiveHours，只顯示休息時數)
        laborHoursDetails: {
            normalHours: 0,
            overtimeHours: 0,
            restHours: restHours, // 📌 初始化時填入正確的休息時數
            netHours: effectiveHours
        }
    };

    if (effectiveHours > 0) {
        // 2. 呼叫核心函式計算薪資
        const salaryResult = calculateDailySalary(effectiveHours, hourlyRate, dayType);

        result.dailySalary = salaryResult.dailySalary;
        result.calculation = salaryResult.calculation;

        // 🌟 修正點 1: 使用展開運算子 (Spread Operator) 整合時數分類 🌟
        // 這確保了 restHours 即使在 salaryResult 中沒有被明確處理，也能被保留。
        if (salaryResult.laborHoursDetails) {
            result.laborHoursDetails = {
                ...salaryResult.laborHoursDetails,
                restHours: restHours // 📌 確保 restHours 覆蓋/更新為本地計算的值
            };
        }

        // 修正點 2: 處理計算後，淨工時可能與有效工時不符的問題 (理論上不應發生，但為穩健而保留)
        result.laborHoursDetails.netHours = effectiveHours;
    }

    return result;
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
        console.log(dailyRecords);
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
                    const monthlySalary = currentManagingEmployee.salary || 30000; // 預設為2025最低月薪，如果無資料
                    const hourlyRate = (monthlySalary / 240); // 確保是數字進行計算，用於傳遞給底層函式

                    const dateObject = new Date(dailyRecord.date);

                    // 檢查轉換是否成功，避免轉換失敗時繼續執行
                    if (isNaN(dateObject)) {
                        console.error(`日期格式錯誤，無法轉換: ${dailyRecord.date}`);
                        return; // 跳過此筆紀錄
                    }

                    const dayOfWeek = dateObject.getDay(); // 0=週日, 6=週六

                    const isNationalHoliday = dailyRecord.isHoliday || false;

                    const dayType = determineDayType(dayOfWeek, isNationalHoliday);
                    console.log(`計算日期: ${dailyRecord.date},dayOfWeek:${dayOfWeek}, 類型: ${dayType}`);
                    const hourlyRateDisplay = hourlyRate.toFixed(2); // 用於顯示

                    // 🚨 關鍵變動：使用新的包裝函式來計算所有細節
                    const {
                        dailySalary,
                        calculation,
                        effectiveHours,
                        totalBreakMinutes
                    } = calculateDailySalaryFromPunches(
                        dailyRecord.punchInTime,
                        dailyRecord.punchOutTime,
                        hourlyRate,
                        dayType
                    );

                    const breakHoursDisplay = (totalBreakMinutes / 60).toFixed(2);
                    const effectiveHoursFixed = effectiveHours.toFixed(2);
                    const dailySalaryFixed = dailySalary.toFixed(2); // 確保薪資顯示兩位小數

                    if (effectiveHours > 0) {
                        salaryHtml = `
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
            <span data-i18n="RECORD_SALARY_PREFIX">當日薪資：</span>
            <span class="font-bold text-indigo-600 dark:text-indigo-400">${dailySalaryFixed} NTD</span>
        </p>
        <details class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            <summary>薪資計算細節</summary>
            <ul class="list-disc ml-4 mt-1 space-y-0.5">
                <li><span data-i18n="HOURLY_RATE_CALCULATED">等效時薪：</span> ${hourlyRateDisplay} NTD/小時</li>
                <li><span data-i18n="BREAK_DEDUCTION">休息扣除：</span> ${breakHoursDisplay}h (淨工時 ${effectiveHoursFixed}h)</li>
                <li><span data-i18n="SALARY_CALCULATION">日薪計算式：</span> ${calculation}</li>
            </ul>
        </details>
    `;
                    } else {
                        // 處理淨工時為 0 但有打卡的情況
                        salaryHtml = `
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
            <span data-i18n="RECORD_SALARY_PREFIX">當日加班薪資：</span>
            0.00 NTD
        </p>
        <p class="text-xs text-red-400 mt-1 italic">
            <span data-i18n="NO_EFFECTIVE_HOURS">淨工時為 0。</span> 休息扣除 ${breakHoursDisplay}h。
        </p>
    `;
                    }
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

/**
 * 在管理員日曆上方顯示一列星期標頭（與月份檢視相同）
 * @param {number} year - 年份
 * @param {number} month - 月份 (0-11)
 */
function _addWeekdayLabelsToAdminCalendar(year, month) {
    const grid = document.getElementById('admin-calendar-grid');
    if (!grid) return;
    const parent = grid.parentNode;
    if (!parent) return;

    // 如果已經存在 header，就更新，否則建立一個放在 grid 之前
    let header = parent.querySelector('.admin-weekday-header');
    if (!header) {
        header = document.createElement('div');
        header.className = 'admin-weekday-header grid grid-cols-7 gap-1 mb-2 text-center text-sm text-gray-600 dark:text-gray-300';
        parent.insertBefore(header, grid);
    } else {
        header.innerHTML = '';
    }

    const lang = (typeof currentLang !== 'undefined' && currentLang) ? currentLang : 'zh-TW';
    const fallbackWeek = ['日', '一', '二', '三', '四', '五', '六'];

    // 使用固定週起始日期 (2021-08-01 為週日)，用 toLocaleDateString 取得短週名稱
    for (let i = 0; i < 7; i++) {
        let label = '';
        try {
            const d = new Date(Date.UTC(2021, 7, 1 + i)); // 2021-08-01 ~ Sun
            label = d.toLocaleDateString(lang, { weekday: 'short' });
        } catch (e) {
            label = `週${fallbackWeek[i]}`;
        }
        const cell = document.createElement('div');
        cell.className = 'py-1';
        cell.textContent = label;
        header.appendChild(cell);
    }
}
// 日子類型常數 (新增區分 例假日 與 國定假日)
const DAY_TYPE = {
    NORMAL: 'NORMAL',         // 平日 (週一至週五)
    REST_DAY: 'REST_DAY',     // 休息日 (週六)
    REGULAR_OFF: 'REGULAR_OFF', // 例假日 (週日)
    HOLIDAY: 'HOLIDAY'         // 國定假日 (特別休假日)
};

/**
 * 根據星期幾和是否為國定假日，判斷該日子的類型。
 * @param {number} dayOfWeek - 星期幾 (0=日, 6=六)
 * @param {boolean} isNationalHoliday - 是否為國定假日 (來自 holiday map)
 * @returns {string} - 回傳 DAY_TYPE 中的常數
 */
function determineDayType(dayOfWeek, isNationalHoliday) {
    if (isNationalHoliday && dayOfWeek === 0) {
        return DAY_TYPE.REGULAR_OFF; // 週日 (例假日)
    }
    if (isNationalHoliday && dayOfWeek === 6) {
        return DAY_TYPE.REST_DAY; // 週六 (休息日)
    }
    if (isNationalHoliday) {
        return DAY_TYPE.HOLIDAY; // 國定假日
    }
    return DAY_TYPE.NORMAL; // 週一到週五 (平日)
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
            //mgmtEmployeeId.textContent = employee.userId;
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



    // 若新增按鈕為 disabled 時，點擊 wrapper 顯示具體提示（未輸入名稱 / 未取得位置）
    const addWrapper = document.getElementById('add-location-wrapper');
    if (addWrapper) {
        addWrapper.addEventListener('click', (e) => {
            const addBtnEl = document.getElementById('add-location-btn');
            if (!addBtnEl) return;
            if (!addBtnEl.disabled) return;

            const nameEl = document.getElementById('location-name');
            const latEl = document.getElementById('location-lat');
            const lngEl = document.getElementById('location-lng');

            let msg = '';
            if (!nameEl || !nameEl.value.trim()) {
                msg = (typeof t === 'function') ? (t('ADD_LOCATION_NAME_REQUIRED') || '請輸入地點名稱') : '請輸入地點名稱';
            } else if (!latEl || !latEl.value.trim() || !lngEl || !lngEl.value.trim()) {
                msg = (typeof t === 'function') ? (t('ADD_LOCATION_COORDS_REQUIRED') || '請先取得位置或在地圖上點選地點') : '請先取得位置或在地圖上點選地點';
            } else {
                msg = (typeof t === 'function') ? (t('ADD_LOCATION_DISABLED_HINT') || '請檢查欄位') : '請檢查欄位';
            }

            showNotification(msg, 'info');
            e.preventDefault();
            e.stopPropagation();
        });
    }

    // 5. 處理新增打卡地點
    addLocationBtn.addEventListener('click', async () => {
        const name = locationName.value; // 假設您有宣告 locationName
        const lat = locationLatInput.value;
        const lng = locationLngInput.value;
        showNotification("請填寫所有欄位並取得位置", "error");
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

    // 註冊月薪收折與匯出功能（確保 DOM 元素已存在）
    setupAdminSalaryToggle && setupAdminSalaryToggle();
    setupAdminExport();
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

// ===================================
// #region 6. 管理員月薪摘要收折邏輯
// ===================================
/**
 * 設置管理員月薪摘要的收合/展開功能。
 */
function setupAdminSalaryToggle() {
    const btn = document.getElementById('toggle-admin-salary-btn');
    const panel = document.getElementById('admin-monthly-salary-display');
    if (!btn || !panel) return;

    // 初始化狀態（預設收折）
    panel.style.display = 'none';
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = '顯示月薪摘要 ▼';

    btn.addEventListener('click', () => {
        const isHidden = panel.style.display === 'none' || panel.style.display === '';
        panel.style.display = isHidden ? 'block' : 'none';
        btn.setAttribute('aria-expanded', String(isHidden));
        btn.textContent = isHidden ? '隱藏月薪摘要 ▲' : '顯示月薪摘要 ▼';
    });
}
/**
 * 設置管理員匯出月曆為 Excel 的功能
 */
function setupAdminExport() {
    const btn = document.getElementById('export-admin-month-excel-btn');
    if (!btn) return;

    const pad = n => String(n).padStart(2, '0');

    function tryParseHoursFromTimes(inTime, outTime, dateStr) {
        // 保留舊的兼容性實作（仍可用）
        if (!inTime || !outTime) return null;
        try {
            const base = new Date(dateStr);
            if (isNaN(base.getTime())) base.setFullYear(new Date().getFullYear());
            const parse = t => {
                if (!t) return null;
                if (/^\d{1,2}:\d{2}$/.test(t)) {
                    const [hh, mm] = t.split(':').map(Number);
                    const d = new Date(base);
                    d.setHours(hh, mm, 0, 0);
                    return d;
                }
                const d = new Date(t);
                return isNaN(d.getTime()) ? null : d;
            };
            const a = parse(inTime);
            const b = parse(outTime);
            if (!a || !b) return null;
            const diffH = (b - a) / 3600000;
            return diffH >= 0 ? Number(diffH.toFixed(2)) : null;
        } catch (e) {
            return null;
        }
    }

    btn.addEventListener('click', async () => {
        const selectEl = document.getElementById('admin-select-employee') || document.getElementById('admin-select-employee-mgmt');
        const userId = selectEl && selectEl.value ? selectEl.value : (currentManagingEmployee && currentManagingEmployee.userId);
        if (!userId) {
            alert('請先選擇員工');
            return;
        }

        // 解析目前顯示的月份
        const monthText = (adminCurrentMonthDisplay && adminCurrentMonthDisplay.textContent) ? adminCurrentMonthDisplay.textContent.trim() : '';
        let year, month;
        const m = monthText.match(/(\d{4}).*?(\d{1,2})/);
        if (m) {
            year = parseInt(m[1], 10);
            month = parseInt(m[2], 10) - 1;
        } else {
            const d = new Date();
            year = d.getFullYear();
            month = d.getMonth();
        }

        const monthKey = `${userId}-${year}-${pad(month + 1)}`;
        let monthData = adminMonthDataCache && adminMonthDataCache[monthKey];
        if (!monthData) {
            try {
                await renderAdminCalendar(userId, new Date(year, month, 1));
                monthData = adminMonthDataCache && adminMonthDataCache[monthKey];
            } catch (e) {
                console.error('載入月資料失敗', e);
            }
        }

        if (!monthData) {
            alert('找不到該月份的資料，請先載入該員工的月曆。');
            return;
        }

        const records = Array.isArray(monthData) ? monthData : (monthData.records || monthData.days || monthData.dailyStatus || []);
        // 建立以日期 key 為索引的 map，使用 normalizeDateKey
        const recordMap = {};
        records.forEach(r => {
            const key = normalizeDateKey(r.date || r.dateKey || r.day || r.dayKey || '');
            if (key) recordMap[key] = r;
        });

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const { baseMonthly, hourlyRate } = resolveHourlyRateForExport();

        const sheetRows = [
            ['日期', '星期', '上班時間', '上班地點', '下班時間', '下班地點',
                '原始時數(小時)', '淨工時(小時)',
                '休息扣除(小時)', '正常工時(小時)', '加班工時(小時)', // <-- 新增欄位
                '日薪(NTD)', '備註']
        ];
        const calcRows = [['日期', '計算過程說明', '日薪 (NTD)']];

        let totalHours = 0, totalRawHours = 0, totalBreakMinutes = 0, totalSalary = 0;
        let totalNormalHours = 0;
        let totalOvertimeHours = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
            const dateObj = new Date(year, month, d);
            const weekday = dateObj.toLocaleDateString(currentLang || 'zh-TW', { weekday: 'short' });

            const r = recordMap[dateKey] || null;
            const punches = getPunchesFromRecord(r);
            const { inPunch, outPunch } = pickInOutPunches(punches);

            const inTime = inPunch ? (inPunch.time || inPunch.timeString || inPunch.clockTime || inPunch.t || inPunch.ts || '') : '';
            const inLoc = inPunch ? (inPunch.location || inPunch.loc || inPunch.place || inPunch.geo || '') : '';
            const outTime = outPunch ? (outPunch.time || outPunch.timeString || outPunch.clockTime || outPunch.t || outPunch.ts || '') : '';
            const outLoc = outPunch ? (outPunch.location || outPunch.loc || outPunch.place || outPunch.geo || '') : '';

            const dayOfWeek = dateObj.getDay(); // 必須從 dateObj 取得
            const isNationalHoliday = r && r.isHoliday || false; // 必須從 r 紀錄或 map 取得
            const dayType = determineDayType(dayOfWeek, isNationalHoliday); // 假設 determineDayType 函式在全域可用
            // 原始時數
            let rawHours = 0;
            if (r && (r.hours != null)) rawHours = Number(r.hours);
            else if (r && (r.totalHours != null)) rawHours = Number(r.totalHours);
            else rawHours = computeRawHoursFromPunches(inPunch, outPunch, dateKey) || 0;

            // 使用 calculateDailySalaryFromPunches（包含休息扣除）或 fallback
            let effectiveHours = 0, breakMinutes = 0, dailySalary = 0, calcDesc = '';
            let normalHours = 0, overtimeHours = 0, restHours = 0;
            if (inTime && outTime && typeof calculateDailySalaryFromPunches === 'function') {
                const res = calculateDailySalaryFromPunches(inTime, outTime, hourlyRate, dayType);
                effectiveHours = Number(res.effectiveHours || 0);
                breakMinutes = Number(res.totalBreakMinutes || 0);
                dailySalary = Number(res.dailySalary || 0);
                calcDesc = res.calculation || `${effectiveHours} × ${hourlyRate.toFixed(2)} = ${dailySalary.toFixed(2)}`;
                if (res.laborHoursDetails) {
                    normalHours = Number(res.laborHoursDetails.normalHours || 0);
                    overtimeHours = Number(res.laborHoursDetails.overtimeHours || 0);
                    // restHours 已經在 calculateDailySalaryFromPunches 中被計算，這裡是從結果物件中再次取得小時數
                    restHours = Number(res.laborHoursDetails.restHours || 0);
                }
            } else {
                effectiveHours = rawHours;
                breakMinutes = 0;
                if (typeof calculateDailySalary === 'function') {

                    const rcalc = calculateDailySalary(effectiveHours, hourlyRate, dayType);
                    dailySalary = rcalc && rcalc.dailySalary ? Number(rcalc.dailySalary) : Number((effectiveHours * hourlyRate) || 0);
                    calcDesc = rcalc && rcalc.calculation ? rcalc.calculation : `${effectiveHours} × ${hourlyRate.toFixed(2)} = ${dailySalary.toFixed(2)}`;
                } else {
                    dailySalary = effectiveHours * hourlyRate;
                    calcDesc = `${effectiveHours} × ${hourlyRate.toFixed(2)} = ${dailySalary.toFixed(2)}`;
                }
            }

            const note = r ? (r.note || r.remark || r.comment || '') : '';

            sheetRows.push([
                dateKey, weekday, inTime, inLoc, outTime, outLoc,
                Number(rawHours.toFixed ? rawHours.toFixed(2) : rawHours),
                Number(effectiveHours.toFixed(2)),
                Number((breakMinutes / 60).toFixed(2)),
                Number(restHours.toFixed(2)), // 休息扣除
                Number(normalHours.toFixed(2)), // 正常工時
                Number(overtimeHours.toFixed(2)), // 加班工時
                Number(dailySalary.toFixed(2)),
                note
            ]);
            calcRows.push([dateKey, calcDesc, Number(dailySalary.toFixed(2))]);

            totalRawHours += Number(rawHours || 0);
            totalHours += Number(effectiveHours || 0);
            totalBreakMinutes += Number(breakMinutes || 0);
            totalSalary += Number(dailySalary || 0);
            totalNormalHours += normalHours;
            totalOvertimeHours += overtimeHours;
        }

        const summaryRows = [
            ['員工', (currentManagingEmployee && currentManagingEmployee.name) || userId],
            ['年度', year],
            ['月份', pad(month + 1)],
            ['基本薪資 (NTD/月)', baseMonthly],
            ['時薪 (NTD/小時)', Number(hourlyRate.toFixed(4))],
            ['總原始時數 (小時)', Number(totalRawHours.toFixed(2))],
            ['總淨工時 (小時)', Number(totalHours.toFixed(2))],
            ['總休息時間 (小時)', Number((totalBreakMinutes / 60).toFixed(2))],
            ['總薪資 (NTD)', Number(totalSalary.toFixed(2))],
            ['總原始時數 (小時)', Number(totalRawHours.toFixed(2))],
            ['總淨工時 (小時)', Number(totalHours.toFixed(2))],
            ['總休息時間 (小時)', Number((totalBreakMinutes / 60).toFixed(2))],
            ['總正常工時 (小時)', Number(totalNormalHours.toFixed(2))], // <-- 新增
            ['總加班工時 (小時)', Number(totalOvertimeHours.toFixed(2))], // <-- 新增
            ['總薪資 (NTD)', Number(totalSalary.toFixed(2))]
        ];

        try {
            const ws1 = XLSX.utils.aoa_to_sheet(sheetRows);
            const ws2 = XLSX.utils.aoa_to_sheet(calcRows);
            const ws3 = XLSX.utils.aoa_to_sheet(summaryRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws1, '月曆');
            XLSX.utils.book_append_sheet(wb, ws2, '計算過程');
            XLSX.utils.book_append_sheet(wb, ws3, '總結');
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });

            // 檔名使用員工姓名或 userId（簡單過濾）
            let employeeName = (currentManagingEmployee && currentManagingEmployee.name) || '';
            if (!employeeName && Array.isArray(allEmployeeList)) {
                const found = allEmployeeList.find(e => e.userId === userId);
                if (found) employeeName = found.name || '';
            }
            if (!employeeName) employeeName = userId ? userId.slice(0, 8) : 'unknown';
            employeeName = String(employeeName).replace(/[\/\\:\*\?"<>\|]/g, '').replace(/\s+/g, '_');

            const filename = `${employeeName}-${year}-${pad(month + 1)}.xlsx`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Excel 匯出失敗', err);
            alert('匯出失敗，請看 console 取得詳細錯誤訊息。');
        }
    });
}
// #endregion
// ===================================

/* ===== 新增：共用 Helper 函式，放在檔案靠近開頭（或 renderAdminCalendar 之前） ===== */

/**
 * 將各種可能的日期表示正規化為 YYYY-MM-DD
 * @param {string|number} raw
 * @returns {string} YYYY-MM-DD 或空字串
 */
function normalizeDateKey(raw) {
    if (!raw && raw !== 0) return '';
    let s = String(raw);
    // 已經是 YYYY-M-D 或 YYYY-MM-DD
    const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m1) {
        const y = m1[1], mo = String(m1[2]).padStart(2, '0'), d = String(m1[3]).padStart(2, '0');
        return `${y}-${mo}-${d}`;
    }
    // YYYYMMDD
    const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    // 嘗試用 Date 解析
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
        const y = dt.getFullYear(), mo = String(dt.getMonth() + 1).padStart(2, '0'), d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${mo}-${d}`;
    }
    return '';
}

/**
 * 從 record 物件取出打卡陣列 (容錯)
 */
function getPunchesFromRecord(r) {
    if (!r) return [];
    if (Array.isArray(r.record)) return r.record;
    if (Array.isArray(r.punches)) return r.punches;
    if (Array.isArray(r.dailyPunches)) return r.dailyPunches;
    if (Array.isArray(r.records)) return r.records;
    return [];
}

/**
 * 從 punches 陣列挑出最合理的上班(第一個 IN)與下班(最後一個 OUT)
 * @param {Array} punches
 * @returns {{inPunch:object|null, outPunch:object|null}}
 */
function pickInOutPunches(punches) {
    let inPunch = null, outPunch = null;
    if (!Array.isArray(punches) || punches.length === 0) return { inPunch, outPunch };

    const isInType = t => /上班|上班打卡|IN|in|clock_in|checkin|start/i.test(String(t || ''));
    const isOutType = t => /下班|下班打卡|OUT|out|clock_out|checkout|end|finish/i.test(String(t || ''));

    for (let i = 0; i < punches.length; i++) {
        const p = punches[i];
        if (!inPunch && (isInType(p.type || p.label || p.tag) || isInType(p.mode || p.action))) inPunch = p;
    }
    for (let i = punches.length - 1; i >= 0; i--) {
        const p = punches[i];
        if (!outPunch && (isOutType(p.type || p.label || p.tag) || isOutType(p.mode || p.action))) outPunch = p;
    }
    if (!inPunch) inPunch = punches[0];
    if (!outPunch) outPunch = punches[punches.length - 1];
    return { inPunch, outPunch };
}

/**
 * 將時間字串（HH:MM 或 ISO）轉為當日 Date（使用 dateKey 作 base）
 */
function parseTimeToDate(timeStr, dateKey) {
    if (!timeStr) return null;
    // 如果是 HH:MM
    const hm = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (hm && dateKey) {
        const [y, m, d] = dateKey.split('-').map(Number);
        const dt = new Date(y, m - 1, d, Number(hm[1]), Number(hm[2]), 0, 0);
        return dt;
    }
    // 嘗試直接解析
    const dt2 = new Date(timeStr);
    return isNaN(dt2.getTime()) ? null : dt2;
}

/**
 * 由 in/out 打卡物件與 dateKey 計算原始時數 (小時，保留兩位)
 */
function computeRawHoursFromPunches(inPunch, outPunch, dateKey) {
    const inTimeStr = inPunch && (inPunch.time || inPunch.timeString || inPunch.clockTime || inPunch.t || inPunch.ts) || '';
    const outTimeStr = outPunch && (outPunch.time || outPunch.timeString || outPunch.clockTime || outPunch.t || outPunch.ts) || '';
    const a = parseTimeToDate(inTimeStr, dateKey);
    const b = parseTimeToDate(outTimeStr, dateKey);
    if (!a || !b) return 0;
    const diff = (b - a) / 3600000;
    return diff >= 0 ? Number(diff.toFixed(2)) : 0;
}

/**
 * 取得時薪（優先 employee.salary，次優 UI 輸入，否則回預設）
 */
function resolveHourlyRateForExport() {
    const empSalary = (currentManagingEmployee && Number(currentManagingEmployee.salary)) || 0;
    const basicSalaryInputEl = document.getElementById('basic-salary') || document.getElementById('basicSalary') || null;
    const inputSalary = basicSalaryInputEl ? Number(basicSalaryInputEl.value || 0) : 0;
    const base = empSalary || inputSalary || 28950;
    const standardMonthHours = 240;
    return { baseMonthly: base, hourlyRate: base > 0 ? (base / standardMonthHours) : 0 };
}
// #endregion
// ===================================
