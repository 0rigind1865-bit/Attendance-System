
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
// #region 1. i18n相關
// ===================================
async function loadTranslations(lang) {
    try {
        const res = await fetch(`https://0rigind1865-bit.github.io/Attendance-System/i18n/${lang}.json`);
        if (!res.ok) {
            throw new Error(`HTTP 錯誤: ${res.status}`);
        }
        translations = await res.json();
        currentLang = lang;
        localStorage.setItem("lang", lang);
        renderTranslations();
    } catch (err) {
        console.error("載入語系失敗:", err);
    }
}

// 翻譯函式
function t(code, params = {}) {
    let text = translations[code] || code;

    // 檢查並替換參數中的變數
    for (const key in params) {
        // 在替換之前，先翻譯參數的值
        let paramValue = params[key];
        if (paramValue in translations) {
            paramValue = translations[paramValue];
        }

        text = text.replace(`{${key}}`, paramValue);
    }
    return text;
}
// renderTranslations 可接受一個容器參數
function renderTranslations(container = document) {
    // 翻譯網頁標題（只在整頁翻譯時執行）
    if (container === document) {
        document.title = t("APP_TITLE");
    }

    // 處理靜態內容：[data-i18n]
    const elementsToTranslate = container.querySelectorAll('[data-i18n]');
    elementsToTranslate.forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translatedText = t(key);

        // 檢查翻譯結果是否為空字串，或是否回傳了原始鍵值
        if (translatedText !== key) {
            if (element.tagName === 'INPUT') {
                element.placeholder = translatedText;
            } else {
                element.textContent = translatedText;
            }
        }
    });

    // ✨ 新增邏輯：處理動態內容的翻譯，使用 [data-i18n-key]
    const dynamicElements = container.querySelectorAll('[data-i18n-key]');
    dynamicElements.forEach(element => {
        const key = element.getAttribute('data-i18n-key');
        if (key) {
            const translatedText = t(key);

            // 只有當翻譯結果不是原始鍵值時才進行更新
            if (translatedText !== key) {
                element.textContent = translatedText;
            }
        }
    });
}
// #endregion
// ===================================

// ===================================
// #region 2. callApi
// ===================================

/**
 * 透過 fetch API 呼叫後端 API。
 * @param {object} params - 包含 action 和所有其他參數的物件 (e.g., { action: '...', month: '...', userId: '...' })
 * @param {string} [loadingId="loading"] - 顯示 loading 狀態的 DOM 元素 ID。
 * @returns {Promise<object>} - 回傳一個包含 API 回應資料的 Promise。
 */
async function callApifetch(params, loadingId = "loading") {
    const token = localStorage.getItem("sessionToken");

    // 1. 構造 URLSearchParams 物件
    const searchParams = new URLSearchParams(params);

    // 2. 自動加入 token
    searchParams.set("token", token);

    // 3. 構造最終 URL
    const url = `${API_CONFIG.apiUrl}?${searchParams.toString()}`;

    // 顯示指定的 loading 元素
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.style.display = "block";

    try {
        // 使用 fetch API 發送請求
        const response = await fetch(url);

        // 檢查 HTTP 狀態碼
        if (!response.ok) {
            throw new Error(`HTTP 錯誤: ${response.status}`);
        }

        // 解析 JSON 回應
        const data = await response.json();
        return data;
    } catch (error) {
        // 處理網路或其他錯誤
        showNotification(t("CONNECTION_FAILED"), "error");
        console.error("API 呼叫失敗:", error);
        // 拋出錯誤以便外部捕獲
        throw error;
    } finally {
        // 不論成功或失敗，都隱藏 loading 元素
        if (loadingEl) loadingEl.style.display = "none";
    }
}

// #endregion
// ===================================

/* ===== 共用訊息顯示 ===== */
const showNotification = (message, type = 'success') => {
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notification-message');
    notificationMessage.textContent = message;
    notification.className = 'notification'; // reset classes
    if (type === 'success') {
        notification.classList.add('bg-green-500', 'text-white');
    } else if (type === 'warning') {
        notification.classList.add('bg-yellow-500', 'text-white');
    } else {
        notification.classList.add('bg-red-500', 'text-white');
    }
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
};