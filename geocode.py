# 新規ファイル: D:\contest\trash\geocode.py
#
# 座標（緯度・経度）から住所文字列を作る「逆ジオコーディング」をまとめたモジュール。
# app.py に直接書かず分離しているのは、
#   - app.py の import 行にあった geolocator（未使用）をここに移し、役割を明確にするため
#   - Nominatim 以外のサービス（国土地理院 API など）に差し替えるとき、このファイルだけ触ればよいようにするため

from typing import Optional

from geopy.exc import GeocoderServiceError, GeocoderTimedOut
from geopy.geocoders import Nominatim

# Nominatim（OpenStreetMap の無料ジオコーダ）。
# 利用規約により、アプリ固有の user_agent が必須・1秒1回まで。
# timeout を付けないとネットワーク不調時に登録画面が開かなくなるので必ず指定する。
geolocator = Nominatim(user_agent="my_trash_app", timeout=5)

# Nominatim は東京都の住所で "province"（都道府県）を返さないことがある。
# その場合も "ISO3166-2-lvl4"（例 "JP-13"）は必ず入っているので、ここから都道府県名を引く。
PREFECTURES_BY_ISO = {
    "JP-01": "北海道", "JP-02": "青森県", "JP-03": "岩手県", "JP-04": "宮城県",
    "JP-05": "秋田県", "JP-06": "山形県", "JP-07": "福島県", "JP-08": "茨城県",
    "JP-09": "栃木県", "JP-10": "群馬県", "JP-11": "埼玉県", "JP-12": "千葉県",
    "JP-13": "東京都", "JP-14": "神奈川県", "JP-15": "新潟県", "JP-16": "富山県",
    "JP-17": "石川県", "JP-18": "福井県", "JP-19": "山梨県", "JP-20": "長野県",
    "JP-21": "岐阜県", "JP-22": "静岡県", "JP-23": "愛知県", "JP-24": "三重県",
    "JP-25": "滋賀県", "JP-26": "京都府", "JP-27": "大阪府", "JP-28": "兵庫県",
    "JP-29": "奈良県", "JP-30": "和歌山県", "JP-31": "鳥取県", "JP-32": "島根県",
    "JP-33": "岡山県", "JP-34": "広島県", "JP-35": "山口県", "JP-36": "徳島県",
    "JP-37": "香川県", "JP-38": "愛媛県", "JP-39": "高知県", "JP-40": "福岡県",
    "JP-41": "佐賀県", "JP-42": "長崎県", "JP-43": "熊本県", "JP-44": "大分県",
    "JP-45": "宮崎県", "JP-46": "鹿児島県", "JP-47": "沖縄県",
}

# Nominatim の address 辞書のうち、日本の住所として「大きい区分 → 小さい区分」の順に並べるキー。
# "road"（道路名）は日本ではあまり住所に使わず、建物内の情報（例 "エレベーター;1階"）が
# 入ってくることもあるので除外している。
ADDRESS_KEYS_IN_ORDER = (
    "city",          # 市・特別区（例 千代田区、大阪市）
    "town",          # 町
    "village",       # 村
    "suburb",        # 区（政令市の区。例 北区）
    "quarter",       # 大字・町名（例 丸の内）
    "neighbourhood", # 丁目（例 丸の内一丁目）
    "house_number",  # 番地
)


def format_japanese_address(address: dict) -> str:
    """Nominatim の address 辞書を「東京都千代田区丸の内一丁目」のような日本式の1行にする。

    Nominatim の loc.address は "1, 丸の内一丁目, 千代田区, 東京都, 100-0005, 日本" のように
    小さい区分から並ぶ英語圏の順序なので、そのまま使わずに組み立て直す。
    """
    parts: list[str] = []

    # 都道府県: "province" があればそれを、無ければ ISO コードから引く
    prefecture = address.get("province") or address.get("state") \
        or PREFECTURES_BY_ISO.get(address.get("ISO3166-2-lvl4", ""))
    if prefecture:
        parts.append(prefecture)

    for key in ADDRESS_KEYS_IN_ORDER:
        value = address.get(key)
        if not value or value in parts:
            # 同じ名前が複数キーに入ることがある（例 city と suburb が両方 "大阪市"）ので重複は除く
            continue
        if parts and value.startswith(parts[-1]):
            # quarter "丸の内" と neighbourhood "丸の内一丁目" のように、
            # 細かい区分が1つ前の区分を含んでいる場合は、細かい方だけ残す（"丸の内丸の内一丁目" を防ぐ）
            parts[-1] = value
        else:
            parts.append(value)

    return "".join(parts)


def reverse_geocode(latitude: float, longitude: float) -> Optional[str]:
    """座標から住所文字列を返す。取得できなければ None（呼び出し側は空欄で続行する）。

    ネットワーク障害や Nominatim 側の一時エラーで登録画面そのものが開かなくなるのを防ぐため、
    例外はここで握りつぶして None にする。ログには残す。
    """
    try:
        location = geolocator.reverse((latitude, longitude), language="ja", exactly_one=True)
    except (GeocoderTimedOut, GeocoderServiceError) as exc:
        print(f"[geocode] 逆ジオコーディング失敗 lat={latitude} lng={longitude}: {exc}")
        return None

    if location is None:
        return None

    address = location.raw.get("address", {})
    formatted = format_japanese_address(address)
    # 組み立てに使えるキーが1つも無かった場合は、順序が逆でも Nominatim の生の住所を返しておく
    return formatted or location.address
