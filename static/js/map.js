document.addEventListener('DOMContentLoaded', function () {

    const mapContainer = document.getElementById('map');
    // HTMLの data-api-url 属性から /api/trashcans のURLを受け取る
    const apiUrl = mapContainer.dataset.apiUrl;
    const addUrl = mapContainer.dataset.addUrl;
    const focusId = mapContainer.dataset.focusId || null;


    // ハンバーガーメニュー内の種別フィルタ
    const typeFilterForm = document.getElementById('typeFilterForm');
    const typeFilterAllBtn = document.getElementById('typeFilterAllBtn');
    const typeFilterNoneBtn = document.getElementById('typeFilterNoneBtn');
    const typeFilterStatusEl = document.getElementById('typeFilterStatus');
    const typeCheckboxes = Array.from(typeFilterForm.querySelectorAll('input[name="type"]'));

    // 周辺検索のUI部品
    const nearbySearchBtn = document.getElementById('nearbySearchBtn');
    const nearbySelect = document.getElementById('nearbySelect');
    const nearbyClearBtn = document.getElementById('nearbyClearBtn');
    const nearbyStatusEl = document.getElementById('nearbyStatus');
    const nearbyListEl = document.getElementById('nearbyList');

    let userMarker = null;         // 現在地の丸マーカー。1つを使い回す
    let nearbyIds = null;          // 周辺検索でヒットしたゴミ箱のID集合。null = 検索していない状態

    const map = L.map('map', {
        minZoom: 5,
        maxBounds: [[20.0, 122.0], [46.0, 154.5]],
        maxBoundsViscosity: 1.0
    }).setView([35.681236, 139.767125], 15);

    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>'
    }).addTo(map);

    // ズームアウト時はピンをまとめて数字で表示し、ズームインすると個別のピンに分かれる
    const markerClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 80,       // 大きいほど、より広い範囲をまとめて1つのクラスターにする
        disableClusteringAtZoom: 14 // このズームレベル以上では、クラスターを解除して個別ピンにする
    });
    map.addLayer(markerClusterGroup);

    // APIから取得したゴミ箱の一覧
    let trashItems = [];
    // 表示/非表示を切り替えられるよう、idからマーカーを引けるようにしておく
    const markersById = new Map();

    // -------------------------
    // 種別フィルタ
    // -------------------------

    // 現在チェックされている種別キーの集合を返す（例: Set {"burnable", "can"}）
    function getSelectedTypes() {
        return new Set(
            typeCheckboxes.filter(checkbox => checkbox.checked).map(checkbox => checkbox.value)
        );
    }

    // ゴミ箱が持つ種別のうち1つでも選択されていれば表示対象とする。
    // 例: types が ["burnable", "can"] のゴミ箱は、「缶」だけ選択中でも表示する
    function matchesTypeFilter(item, selectedTypes) {
        return item.types.some(type => selectedTypes.has(type));
    }

    // マーカーの表示/非表示を決める唯一の場所。
    // 表示条件が増えても（例: 周辺検索）判定はこの関数に集約し、
    // 条件が2箇所に分かれて食い違うのを防ぐ。
    // チェック状態を変えたら必ずこの関数を呼び直すこと。
    // マーカーは markerClusterGroup に対して追加/削除する（地図に直接ではない）。
    function updateMarkerVisibility() {
        const selectedTypes = getSelectedTypes();
        trashItems.forEach(item => {
            const marker = markersById.get(item.id);
            // 種別フィルタ AND 周辺検索（nearbyIds が null なら周辺検索の制約なし）
            const visible = matchesTypeFilter(item, selectedTypes)
                && (nearbyIds === null || nearbyIds.has(item.id));
            if (visible && !markerClusterGroup.hasLayer(marker)) {
                markerClusterGroup.addLayer(marker);
            } else if (!visible && markerClusterGroup.hasLayer(marker)) {
                markerClusterGroup.removeLayer(marker);
            }
        });
        typeFilterStatusEl.textContent = `${selectedTypes.size} / ${typeCheckboxes.length} 種類を表示中`;
    }


    // チェックボックスは5個あるが、リスナーはフォームに1つ付ければよい。
    // change イベントは子要素から親へ伝わる（イベントバブリング）ため
    typeFilterForm.addEventListener('change', updateMarkerVisibility);

    typeFilterAllBtn.addEventListener('click', () => {
        typeCheckboxes.forEach(checkbox => { checkbox.checked = true; });
        updateMarkerVisibility();
    });

    typeFilterNoneBtn.addEventListener('click', () => {
        typeCheckboxes.forEach(checkbox => { checkbox.checked = false; });
        updateMarkerVisibility();
    });

    // -------------------------
    // ゴミの種類ごとのピン色
    // -------------------------

    // キーは constants.py の GARBAGE_TYPES と一致させる
    const TYPE_COLORS = {
        burnable: '#e53935',     // 燃えるゴミ: 赤
        nonburnable: '#1e88e5',  // 燃えないゴミ: 青
        can: '#8e24aa',          // 缶: 紫
        pet_bottle: '#43a047',   // ペットボトル: 緑
        glass: '#fb8c00'         // ビン: オレンジ
    };
    const DEFAULT_COLOR = '#757575'; // 未知の種別: グレー

    // フィルタ項目と凡例のスウォッチに TYPE_COLORS の色を反映する
    document.querySelectorAll('.type-swatch').forEach(el => {
        el.style.backgroundColor = TYPE_COLORS[el.dataset.type] || DEFAULT_COLOR;
    });

    // 複数種別のゴミ箱は各色を縞にして1つのピンで表現する
    function markerIcon(types) {
        const colors = (types && types.length ? types : [null])
            .map(type => TYPE_COLORS[type] || DEFAULT_COLOR);
        const background = colors.length === 1
            ? colors[0]
            : `linear-gradient(90deg, ${colors.map((c, i) =>
                `${c} ${i * 100 / colors.length}% ${(i + 1) * 100 / colors.length}%`).join(', ')})`;
        return L.divIcon({
            className: '',
            html: `<div class="marker-pin" style="background: ${background};"></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 22],
            tooltipAnchor: [0, -20]
        });
    }

    // -------------------------
    // マーカー生成
    // -------------------------

    function renderMarkers(items) {
        items.forEach(item => {
            const marker = L.marker([item.latitude, item.longitude], {
                icon: markerIcon(item.types)
            });
            marker.bindTooltip(item.name);
            markersById.set(item.id, marker);
            marker.on('click', () => {
                window.location.href = `/trash/${item.id}`;
            });
            markerClusterGroup.addLayer(marker);

            // data-focus-id はHTMLのdata属性（常に文字列）なので、
            // item.id（数値）は String() で変換してから比較する
            if (focusId && String(item.id) === focusId) {
                // クラスターに含まれている場合はズーム前にクラスターを開く必要がある
                markerClusterGroup.zoomToShowLayer(marker, () => {
                    marker.openTooltip();
                });
            }
        });
        // 初期状態は全種別チェック済みなので全件表示になるが、
        // ブラウザの「戻る」でチェック状態が復元される場合に備え、必ず反映しておく
        updateMarkerVisibility();
    }

    // -------------------------
    // 都道府県ごとの件数集計
    // -------------------------

    function renderPrefectureSummary(items) {
        const counts = {};
        items.forEach(item => {
            const pref = item.prefecture || '不明';
            counts[pref] = (counts[pref] || 0) + 1;
        });
    
    const prefectureToggleBtn = document.getElementById('prefectureToggleBtn');
    const prefecturePanel = document.getElementById('prefecturePanel');

    prefectureToggleBtn.addEventListener('click', () => {
        prefecturePanel.hidden = !prefecturePanel.hidden;
    });

        const summaryEl = document.getElementById('prefectureSummary');
        summaryEl.innerHTML = '';
        Object.entries(counts)
            .sort((a, b) => b[1] - a[1])  // 件数が多い順
            .forEach(([pref, count]) => {
                const li = document.createElement('li');
                li.textContent = `${pref}：${count}件`;
                summaryEl.appendChild(li);
            });
    }

    // -------------------------
    // 周辺検索
    // -------------------------

    // 2地点間の距離をメートル単位で計算する（Haversine公式）
    function distanceMeters(lat1, lng1, lat2, lng2) {
        const R = 6371000; // 地球の半径(m)
        const toRad = deg => deg * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // 「現在地から探す」実行。
    // マーカーの表示/非表示はここでは行わず、nearbyIds を更新して updateMarkerVisibility に任せる
    function runNearbySearch(userLat, userLng) {
        const radius = Number(nearbySelect.value);
        const selectedTypes = getSelectedTypes();  

        if (userMarker) {
            map.removeLayer(userMarker);
        }
        userMarker = L.circleMarker([userLat, userLng], {
            radius: 10,
            color: '#5f5b5b',
            fillColor: '#bc0d0d',
            fillOpacity: 0.9,
            weight: 2
        }).addTo(map);
        userMarker.bindTooltip('現在地');

        const nearbyItems = [];
        trashItems.forEach(item => {
            const dist = distanceMeters(userLat, userLng, item.latitude, item.longitude);
            if (dist <= radius && matchesTypeFilter(item, selectedTypes)) {
                nearbyItems.push({ item, dist });
            }
        });
        nearbyItems.sort((a, b) => a.dist - b.dist);

        if (nearbyItems.length === 0) {
            nearbyIds = new Set();
            updateMarkerVisibility();
            nearbyListEl.innerHTML = '';
            nearbyStatusEl.textContent = 'この周囲にはありません';
            map.setView([userLat, userLng], 16);
            return;
        }

        nearbyIds = new Set(nearbyItems.map(entry => entry.item.id));
        updateMarkerVisibility();

        nearbyStatusEl.textContent = `${nearbyItems.length} 件見つかりました`;

        nearbyListEl.innerHTML = '';
        nearbyItems.forEach(({ item, dist }) => {
            const li = document.createElement('li');
            li.textContent = `${item.name}（約${Math.round(dist)}m）`;
            li.addEventListener('click', () => {
                const marker = markersById.get(item.id);
                markerClusterGroup.zoomToShowLayer(marker, () => {
                    marker.openTooltip();
                });
            });
            nearbyListEl.appendChild(li);
        });

        const bounds = L.latLngBounds([[userLat, userLng]]);
        nearbyItems.forEach(({ item }) => bounds.extend([item.latitude, item.longitude]));
        map.fitBounds(bounds, { padding: [40, 40] });
    }

    // 「クリア」。種別フィルタの状態は維持し、周辺検索の絞り込みだけ解除する
    function clearNearbySearch() {
        nearbyIds = null;
        if (userMarker) {
            map.removeLayer(userMarker);
            userMarker = null;
        }
        nearbyStatusEl.textContent = '';
        nearbyListEl.innerHTML = '';
        updateMarkerVisibility();
    }

    nearbySearchBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            nearbyStatusEl.textContent = 'お使いのブラウザは位置情報に対応していません。';
            return;
        }
        nearbyStatusEl.textContent = '現在地を取得中...';
        navigator.geolocation.getCurrentPosition(
            position => runNearbySearch(position.coords.latitude, position.coords.longitude),
            () => { nearbyStatusEl.textContent = '現在地を取得できませんでした。'; }
        );
    });

    nearbyClearBtn.addEventListener('click', clearNearbySearch);

    // 絞り込みはせず、現在地マーカーだけ表示する（ページを開いたときの自動実行用）
    function showUserLocationOnly(userLat, userLng) {
        if (userMarker) {
            map.removeLayer(userMarker);
        }
        userMarker = L.circleMarker([userLat, userLng], {
            radius: 10,
            color: '#e51e1e',
            fillColor: '#f54242',
            fillOpacity: 0.9,
            weight: 2
        }).addTo(map);
        userMarker.bindTooltip('現在地');
    }

    // -------------------------
    // 初期データ取得
    // -------------------------

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            trashItems = data.items;
            renderMarkers(trashItems);
            renderPrefectureSummary(trashItems);
        });

    // ページを開いたら自動で現在地マーカーを表示する（絞り込みはしない）
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => showUserLocationOnly(position.coords.latitude, position.coords.longitude),
            () => { /* 取得失敗時は何もしない */ }
        );
    }


    let pickMarker = null;  

    function buildAddUrl(lat, lng) {
        const params = new URLSearchParams({ lat: lat.toFixed(6), lng: lng.toFixed(6) });
        return `${addUrl}?${params.toString()}`;
    }

    function openPickPopup(lat, lng) {
        const html = `
            <div class="pick-popup">
                <p class="pick-popup-coords">緯度 ${lat.toFixed(6)}<br>経度 ${lng.toFixed(6)}</p>
                <a class="pick-popup-btn" href="${buildAddUrl(lat, lng)}">この場所にゴミ箱を登録</a>
                <p class="pick-popup-hint">マーカーはドラッグで微調整できます</p>
            </div>`;
        pickMarker.bindPopup(html).openPopup();
    }

    map.on('contextmenu', function (event) {
        event.originalEvent.preventDefault(); 
        const { lat, lng } = event.latlng;
        if (pickMarker === null) {
            pickMarker = L.marker([lat, lng], { draggable: true, opacity: 0.75, zIndexOffset: 1000 }).addTo(map);
            pickMarker.on('dragend', function () {
                const pos = pickMarker.getLatLng();
                openPickPopup(pos.lat, pos.lng);   // ドラッグ後の位置で URL を作り直す
            });
        } else {
            pickMarker.setLatLng([lat, lng]);
        }
        openPickPopup(lat, lng);
    });

});