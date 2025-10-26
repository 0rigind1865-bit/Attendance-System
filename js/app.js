// ===================================
// #region 1. 檢查登錄 (修正 ensureLogin 函式)
// ===================================

/**
 * 檢查 Token 並驗證用戶身份，同時檢查是否為管理員。
 * @returns {Promise<{isLoggedIn: boolean, isAdmin: boolean}>}
 */
async function ensureLogin() {
    return new Promise(async (resolve) => {

        // 預設未登入狀態
        const defaultResult = { isLoggedIn: false, isAdmin: false };

        if (localStorage.getItem("sessionToken")) {
            document.getElementById("status").textContent = t("CHECKING_LOGIN");
            try {
                const res = await callApifetch({ action: 'checkSession' });

                if (res.ok) {
                    const isAdmin = (res.user.dept === "管理員");

                    // 🌟 關鍵修正：儲存 isAdmin 狀態
                    localStorage.setItem("isAdmin", isAdmin ? 'true' : 'false');

                    if (isAdmin) {
                        // 顯示管理員按鈕
                        document.getElementById('tab-admin-btn').style.display = 'block';
                    }

                    document.getElementById("user-name").textContent = res.user.name;
                    document.getElementById("profile-img").src = res.user.picture || res.user.rate;
                    localStorage.setItem("sessionUserId", res.user.userId);
                    showNotification(t("LOGIN_SUCCESS"));

                    // 顯示用戶介面
                    document.getElementById('login-section').style.display = 'none';
                    document.getElementById('user-header').style.display = 'flex';
                    document.getElementById('main-app').style.display = 'block';

                    // 檢查異常打卡 (在 checkSession 成功後執行)
                    checkAbnormal();

                    resolve({ isLoggedIn: true, isAdmin: isAdmin }); // 🌟 回傳狀態
                } else {
                    const errorMsg = t(res.code || "UNKNOWN_ERROR");
                    showNotification(`❌ ${errorMsg}`, "error");
                    document.getElementById("status").textContent = t("PLEASE_RELOGIN");
                    document.getElementById('login-btn').style.display = 'block';
                    document.getElementById('user-header').style.display = 'none';
                    document.getElementById('main-app').style.display = 'none';
                    resolve(defaultResult);
                }
            } catch (err) {
                console.error(err);
                document.getElementById('login-btn').style.display = 'block';
                document.getElementById('user-header').style.display = 'none';
                document.getElementById('main-app').style.display = 'none';
                document.getElementById("status").textContent = t("PLEASE_RELOGIN");
                resolve(defaultResult);
            }
        } else {
            // 未找到 Token，顯示登入按鈕
            document.getElementById('login-btn').style.display = 'block';
            document.getElementById('user-header').style.display = 'none';
            document.getElementById('main-app').style.display = 'none';
            document.getElementById("status").textContent = t("SUBTITLE_LOGIN");
            resolve(defaultResult);
        }
    });
}
// #endregion
// ===================================


// ===================================
// #region 2. 全域變數賦值 (getDOMElements)
// ===================================
// 註：所有變數的宣告 (let loginBtn = null;) 都在 js/state.js 中完成。
function getDOMElements() {
    // ⚠️ 注意：這裡移除了 const/let，直接對 state.js 的全域變數賦值

    // 核心 UI 元素
    loginBtn = document.getElementById('login-btn');
    logoutBtn = document.getElementById('logout-btn');
    punchInBtn = document.getElementById('punch-in-btn');
    punchOutBtn = document.getElementById('punch-out-btn');

    // Tab 按鈕
    tabDashboardBtn = document.getElementById('tab-dashboard-btn');
    tabMonthlyBtn = document.getElementById('tab-monthly-btn');
    tabLocationBtn = document.getElementById('tab-location-btn');
    tabAdminBtn = document.getElementById('tab-admin-btn');

    // 員工異常紀錄
    abnormalList = document.getElementById('abnormal-list');
    adjustmentFormContainer = document.getElementById('adjustment-form-container');
    recordsLoadingEl = document.getElementById("records-loading");
    abnormalRecordsSectionEl = document.getElementById("abnormal-records-section");
    abnormalListEl = document.getElementById("abnormal-list");
    recordsEmptyEl = document.getElementById("records-empty");

    // 員工月曆
    calendarGrid = document.getElementById('calendar-grid');

    // 地點管理 (Admin / Location View)
    getLocationBtn = document.getElementById('get-location-btn');
    locationLatInput = document.getElementById('location-lat');
    locationLngInput = document.getElementById('location-lng');
    addLocationBtn = document.getElementById('add-location-btn');

    locationName = document.getElementById('location-name');
    // 管理員專用：員工日曆
    adminSelectEmployee = document.getElementById('admin-select-employee');
    adminEmployeeCalendarCard = document.getElementById('admin-employee-calendar-card');
    adminPrevMonthBtn = document.getElementById('admin-prev-month-btn');
    adminNextMonthBtn = document.getElementById('admin-next-month-btn');
    adminCalendarGrid = document.getElementById('admin-calendar-grid');

    // 管理員專用：日紀錄與審批
    adminDailyRecordsCard = document.getElementById('admin-daily-records-card');
    adminDailyRecordsTitle = document.getElementById('admin-daily-records-title');
    adminDailyRecordsList = document.getElementById('admin-daily-records-list');
    adminRecordsLoading = document.getElementById("admin-records-loading");
    adminDailyRecordsEmpty = document.getElementById('admin-daily-records-empty');

    requestsLoading = document.getElementById('requests-loading');
    requestsEmpty = document.getElementById('requests-empty');
    pendingRequestsList = document.getElementById('pending-requests-list');
    toggleRequestsIcon = document.getElementById('toggle-requests-icon');//
    pendingRequestsContent = document.getElementById('pending-requests-content');//
    toggleRequestsBtn = document.getElementById('toggle-requests-btn');
    adminCurrentMonthDisplay = document.getElementById('admin-current-month-display');
    // 假設所有其他相關 DOM 元素也已在這裡被獲取
}
// #endregion
// ===================================


// ===================================
// #region 3. 事件綁定總覽
// ===================================
function bindEvents() {
    // 登入/登出事件
    loginBtn.onclick = async () => {
        // --- 【新增：環境判斷邏輯】 ---
        const currentUrl = window.location.href;
        // 判斷當前網址是否包含正式環境的域名
        const isProduction = currentUrl.includes(PROD_HOST);
        // 準備傳遞給 GAS 的參數 (payload)
        const payload = {
            action: 'getLoginUrl',
            // 將判斷結果作為參數傳給後端
            isProduction: isProduction ? 'true' : 'false'
            // GAS 後端會讀取這個參數來決定 baseUrl
        };
        const res = await callApifetch(payload);
        //const res = await callApifetch({ action: 'getLoginUrl' });
        if (res.url) window.location.href = res.url;
    };

    logoutBtn.onclick = () => {
        localStorage.removeItem("sessionToken");
        localStorage.removeItem("isAdmin"); // 清除管理員狀態
        localStorage.removeItem("sessionUserId"); // 清除用戶ID
        window.location.href = "/Attendance-System"
    };

    // === 核心業務：打卡事件 (呼叫 punch.js 中的 doPunch) ===
    punchInBtn.addEventListener('click', () => doPunch("上班"));
    punchOutBtn.addEventListener('click', () => doPunch("下班"));

    // === 導航 Tab 切換事件 (修正 tabAdminBtn 的邏輯) ===
    tabDashboardBtn.addEventListener('click', () => switchTab('dashboard-view'));
    tabLocationBtn.addEventListener('click', () => switchTab('location-view'));
    tabMonthlyBtn.addEventListener('click', () => switchTab('monthly-view'));

    // 🌟 修正點：Tab 按鈕點擊時，直接依賴 localStorage 判斷權限
    tabAdminBtn.addEventListener('click', () => {
        const isUserAdmin = (localStorage.getItem("isAdmin") === 'true');

        if (isUserAdmin) {
            switchTab('admin-view');
        } else {
            showNotification(t("ERR_NO_PERMISSION"), "error");
        }
    });

    // === 月曆按鈕事件 (員工自己的月曆) ===
    document.getElementById('prev-month').addEventListener('click', () => {
        currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
        renderCalendar(currentMonthDate); // 來自 ui.js
    });

    document.getElementById('next-month').addEventListener('click', () => {
        currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
        renderCalendar(currentMonthDate); // 來自 ui.js
    });

    // === 語系切換事件 ===
    document.getElementById('language-switcher').addEventListener('change', (e) => {
        const newLang = e.target.value;
        loadTranslations(newLang);

        // 重新初始化需要翻譯的 Tab
        const currentTab = document.querySelector('.active');
        const currentTabId = currentTab ? currentTab.id : null;

        if (currentTabId === 'location-view') {
            initLocationMap(true); // 來自 location.js
        }
        // 這裡可以根據需要重新渲染當前視圖，確保所有 i18n 元素被更新
    });
}
// #endregion
// ===================================

// ===================================
// #region 4. 應用程式入口點 (DOMContentLoaded 內部 - 核心啟動流程)
// ===================================

document.addEventListener('DOMContentLoaded', async () => {

    // I. 獲取所有 DOM 元素和狀態設置
    getDOMElements(); // 必須在最前面執行
    document.getElementById('language-switcher').value = currentLang;
    localStorage.setItem("lang", currentLang);

    // II. 載入基本狀態 (翻譯)
    await loadTranslations(currentLang);

    // III. 綁定所有事件
    bindEvents(); // 核心事件綁定 (登入/登出、Tab 切換)
    bindPunchEvents(); // 來自 punch.js，綁定補打卡等事件

    // ==========================================
    // IV. 核心登入檢查和流程控制
    // ==========================================
    let loginResult = { isLoggedIn: false, isAdmin: false };
    const params = new URLSearchParams(window.location.search);
    const otoken = params.get('code');

    if (otoken) {
        // 處理 otoken 換取 sessionToken 的流程
        document.getElementById("status").textContent = t("VERIFYING_AUTH");
        try {
            const res = await callApifetch({ action: 'getProfile', otoken: otoken });
            if (res.ok && res.sToken) {
                localStorage.setItem("sessionToken", res.sToken);
                history.replaceState({}, '', window.location.pathname);
                // 成功換取 sessionToken 後，檢查會話並獲取權限
                loginResult = await ensureLogin();
            } else {
                showNotification(t("ERROR_LOGIN_FAILED", { msg: res.msg || t("UNKNOWN_ERROR") }), "error");
                loginBtn.style.display = 'block';
            }
        } catch (err) {
            console.error(err);
            loginBtn.style.display = 'block';
        }
    } else {
        // 處理沒有 otoken 的情況 (檢查是否有 sessionToken)
        loginResult = await ensureLogin();
    }

    // ==========================================
    // V. 登入成功後的初始化 (關鍵修正區塊)
    // ==========================================
    if (loginResult.isLoggedIn) {
        checkAutoPunch(); // 來自 punch.js
        renderCalendar(currentMonthDate); // 來自 ui.js，員工自己的日曆

        // 🌟 關鍵修正：只有管理員才啟動 loadAdminDashboard 🌟
        if (loginResult.isAdmin) {
            await loadAdminDashboard(); // 來自 admin.js，載入員工列表和綁定事件
        }
    }
});
// #endregion