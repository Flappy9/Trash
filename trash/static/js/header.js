document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('hamburgerBtn');
    const menu = document.getElementById('hamburgerMenu');
    // 地図ページ以外ではハンバーガーが存在しないので、何もせず終了する
    if (!btn || !menu) {
        return;
    }

    btn.addEventListener('click', function () {
        const willOpen = menu.hidden;
        menu.hidden = !willOpen;
        // スクリーンリーダーに開閉状態を伝えるための属性
        btn.setAttribute('aria-expanded', String(willOpen));
    });

    // メニューの外側をクリックしたら閉じる。
    // メニュー内（チェックボックスの操作）とボタン内（3本線の span）は除外する。
    // event.target !== btn だと、span をクリックしたときに「外側」と判定され、
    // 開いた直後に閉じてしまうため contains() で内部要素ごと除外する。
    document.addEventListener('click', function (event) {
        if (!menu.hidden && !menu.contains(event.target) && !btn.contains(event.target)) {
            menu.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
        }
    });
});
