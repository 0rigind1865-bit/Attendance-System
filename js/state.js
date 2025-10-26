//let currentLang = localStorage.getItem("lang");//當前語言
let currentMonthDate = new Date();//當前月份
let translations = {};
let monthDataCache = {}; // 新增：用於快取月份打卡資料
let isApiCalled = false; // 新增：用於追蹤 API 呼叫狀態，避免重複呼叫
let userId = localStorage.getItem("sessionUserId");

// 新增用於管理員日曆檢視的狀態變數
let adminSelectedUserId = null;
let adminCurrentDate = new Date(); // 初始化為當前月份
let allEmployeeList = []; // 用於儲存所有員工列表
const adminMonthDataCache = {};

// 定義您的正式環境特徵
const PROD_HOST = '0rigind1865-bit.github.io';

// 員工/通用 UI 元素
let loginBtn = null;
let logoutBtn = null;
let punchInBtn = null;
let punchOutBtn = null;
let tabDashboardBtn = null;
let tabMonthlyBtn = null;
let tabLocationBtn = null;
let tabAdminBtn = null;
let abnormalList = null;
let adjustmentFormContainer = null;
let calendarGrid = null;

// 地點管理元素 (Admin/Location View)
let getLocationBtn = null;
let locationLatInput = null;
let locationLngInput = null;
let addLocationBtn = null;

// 管理員專屬元素
let adminSelectEmployee = null;
let adminEmployeeCalendarCard = null;
let adminPrevMonthBtn = null;
let adminNextMonthBtn = null;
// 🌟 新增：全域宣告管理員日紀錄相關的 DOM 元素 🌟
let adminDailyRecordsCard = null;
let adminDailyRecordsTitle = null;
let adminDailyRecordsList = null;
let adminRecordsLoading = null;
let adminDailyRecordsEmpty = null;

let pendingRequests = []; // 新增：用於快取待審核的請求

// 全域變數，用於儲存地圖實例
let mapInstance = null;
let mapLoadingText = null;
let currentCoords = null;
let marker = null;
let circle = null;
/**
 * 從後端取得所有打卡地點，並將它們顯示在地圖上。
 */
// 全域變數，用於儲存地點標記和圓形
let locationMarkers = L.layerGroup();
let locationCircles = L.layerGroup();

// 語系初始化邏輯 (從 DOMContentLoaded 移至此處)
let currentLang = localStorage.getItem("lang");

if (!currentLang) {
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith("zh")) {
        currentLang = "zh-TW";
    } else if (browserLang.startsWith("ja")) {
        currentLang = "ja";
    } else if (browserLang.startsWith("vi")) {
        currentLang = "vi";
    } else if (browserLang.startsWith("id")) {
        currentLang = "id";
    } else {
        currentLang = "en-US";
    }
}

let requestsLoading = null;
let requestsEmpty = null;
let pendingRequestsList = null;

let recordsLoadingEl = null;
let abnormalRecordsSectionEl = null;
let abnormalListEl = null;
let recordsEmptyEl = null;
let adminCalendarGrid = null;
let adminEventsBound = null;
let toggleRequestsBtn = null;
let pendingRequestsContent = null;

let toggleRequestsIcon = null;

let adminCurrentMonthDisplay = null;
