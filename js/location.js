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
/**
 * 從後端取得所有打卡地點，並將它們顯示在地圖上。
 */
async function fetchAndRenderLocationsOnMap() {
    try {
        //const res = await callApifetch("getLocations");
        const res = await callApifetch({
            action: 'getLocations' // 使用 endpoint 變數的值作為 action
        });
        // 清除舊的地點標記和圓形
        locationMarkers.clearLayers();
        locationCircles.clearLayers();

        if (res.ok && Array.isArray(res.locations)) {
            // 遍歷所有地點並在地圖上放置標記和圓形
            res.locations.forEach(loc => {
                // 如果沒有容許誤差，則預設為 50 公尺
                const punchInRadius = loc.scope || 50;

                // 加入圓形範圍
                const locationCircle = L.circle([loc.lat, loc.lng], {
                    color: 'red',
                    fillColor: '#f03',
                    fillOpacity: 0.2,
                    radius: punchInRadius
                });
                locationCircle.bindPopup(`<b>${loc.name}</b><br>可打卡範圍：${punchInRadius}公尺`);
                locationCircles.addLayer(locationCircle);
            });

            // 將所有地點標記和圓形一次性加到地圖上
            locationMarkers.addTo(mapInstance);
            locationCircles.addTo(mapInstance);

            console.log("地點標記和範圍已成功載入地圖。");
        } else {
            showNotification("取得地點清單失敗：" + res.msg, "error");
            console.error("Failed to fetch locations:", res.msg);
        }
    } catch (error) {
        showNotification("取得地點清單失敗，請檢查網路。", "error");
        console.error("Failed to fetch locations:", error);
    }
}
// 初始化地圖並取得使用者位置
function initLocationMap(forceReload = false) {
    const mapContainer = document.getElementById('map-container');
    const statusEl = document.getElementById('location-status');
    const coordsEl = document.getElementById('location-coords');
    console.log(mapInstance && !forceReload);
    // 取得載入文字元素
    if (!mapLoadingText) {
        mapLoadingText = document.getElementById('map-loading-text');
    }
    // 檢查地圖實例是否已存在
    if (mapInstance) {
        // 如果已經存在，並且沒有被要求強制重新載入，則直接返回
        if (!forceReload) {
            mapInstance.invalidateSize();
            return;
        }

        // 如果被要求強制重新載入，則先徹底銷毀舊的地圖實例
        mapInstance.remove();
        mapInstance = null;
    }


    // 顯示載入中的文字
    mapLoadingText.style.display = 'block'; // 或 'block'，根據你的樣式決定

    // 建立地圖
    mapInstance = L.map('map-container', {
        center: [25.0330, 121.5654], // 預設中心點為台北市
        zoom: 13
    });

    // 加入 OpenStreetMap 圖層
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapInstance);

    // 讓地圖在完成載入後隱藏載入中的文字
    mapInstance.whenReady(() => {
        mapLoadingText.style.display = 'none';
        // 確保地圖的尺寸正確
        mapInstance.invalidateSize();
    });

    // 顯示載入狀態
    //mapContainer.innerHTML = t("MAP_LOADING");
    statusEl.textContent = t('DETECTING_LOCATION');
    coordsEl.textContent = t('UNKNOWN_LOCATION');

    // 取得使用者地理位置
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                currentCoords = [latitude, longitude];

                // 更新狀態顯示
                statusEl.textContent = t('DETECTION_SUCCESS');
                coordsEl.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

                // 設定地圖視圖
                mapInstance.setView(currentCoords, 18);

                // 在地圖上放置標記
                if (marker) mapInstance.removeLayer(marker);
                marker = L.marker(currentCoords).addTo(mapInstance)
                    .bindPopup(t('CURRENT_LOCATION'))
                    .openPopup();


            },
            (error) => {
                // 處理定位失敗
                statusEl.textContent = t('ERROR_GEOLOCATION_PERMISSION_DENIED');
                console.error("Geolocation failed:", error);

                let message;
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        message = t('ERROR_GEOLOCATION_PERMISSION_DENIED');
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message = t('ERROR_GEOLOCATION_UNAVAILABLE');
                        break;
                    case error.TIMEOUT:
                        message = t('ERROR_GEOLOCATION_TIMEOUT');
                        break;
                    case error.UNKNOWN_ERROR:
                        message = t('ERROR_GEOLOCATION_UNKNOWN');
                        break;
                }
                showNotification(`定位失敗：${message}`, "error");
            }
        );
        // 成功取得使用者位置後，載入所有打卡地點
        fetchAndRenderLocationsOnMap();
    } else {
        showNotification(t('ERROR_BROWSER_NOT_SUPPORTED'), "error");
        statusEl.textContent = '不支援定位';
    }
}