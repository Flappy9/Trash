from flask import Flask, render_template, request, redirect, url_for
from geopy.geocoders import Nominatim
import os
from form import AddGarbageForm
from models import db, TrashCan
from constants import GARBAGE_TYPES, extract_prefecture
from geocode import reverse_geocode

GARBAGE_TYPE_LABELS = dict(GARBAGE_TYPES)

# app.py の設定部分（instance_dir の定義あたり）に追加
from werkzeug.utils import secure_filename
import uuid


basedir = os.path.abspath(os.path.dirname(__file__))
instance_dir = os.path.join(basedir, 'instance')
os.makedirs(instance_dir, exist_ok=True)

app = Flask(__name__)
geolocator = Nominatim(user_agent="my_trash_app")
app.config['SECRET_KEY'] = os.urandom(24)
UPLOAD_DIR = os.path.join(basedir, 'static', 'uploads')
UPLOAD_FOLDER = os.path.join(basedir, 'static', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024   # アップロード上限 5MB（DoS 対策）

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(instance_dir, 'trash_cans.sqlite')
db.init_app(app)

with app.app_context():
    db.create_all()


# -------------------------
# ルーティング
# -------------------------


# 地図ページ
@app.route("/")
def map_page():
    return render_template("map.html")




# ゴミ箱追加ページ
@app.route("/add", methods=['GET', 'POST'])
def add_page():
    form = AddGarbageForm()
    if form.validate_on_submit():
        trash_can = TrashCan(
            name=form.name.data,
            address=form.address.data,
            latitude=form.latitude.data,
            longitude=form.longitude.data,
            type=",".join(form.type.data),
            photo_filename=save_photo(form.photo.data)
        )
        db.session.add(trash_can)
        db.session.commit()
        return redirect(url_for("thankyou_page"))


    prefilled = False
    if request.method == 'GET':
        latitude = request.args.get('lat', type=float)
        longitude = request.args.get('lng', type=float)
        if (latitude is not None and longitude is not None
                and -90 <= latitude <= 90 and -180 <= longitude <= 180):
            form.latitude.data = latitude
            form.longitude.data = longitude
            form.address.data = reverse_geocode(latitude, longitude) or ""
            prefilled = True

    return render_template("add.html", form=form, prefilled=prefilled)

# 登録完了ページ
@app.route("/thankyou")
def thankyou_page():
    return render_template("thankyou.html")

@app.context_processor
def inject_garbage_types():
    return {"garbage_types": GARBAGE_TYPES}

@app.route("/api/trashcans")
def api_trashcans():
    trash_cans = TrashCan.query.all()
    return {
        "items": [
            {
                "id": t.id,
                "name": t.name,
                "latitude": t.latitude,
                "longitude": t.longitude,
                "types": t.type.split(","),
                "prefecture": extract_prefecture(t.address)

            } for t in trash_cans
        ]
    }

@app.route("/trash/<int:trash_id>")
def detail_page(trash_id):
    trash_can = db.get_or_404(TrashCan, trash_id)
    type_labels = [GARBAGE_TYPE_LABELS.get(key, key) for key in trash_can.type.split(",")]
    return render_template("detail.html", item=trash_can, type_labels=type_labels)

@app.route("/trash/<int:trash_id>/edit", methods=['GET', 'POST'])
def edit_page(trash_id):
    trash_can = db.get_or_404(TrashCan, trash_id)
    form = AddGarbageForm(
        name =trash_can.name, address=trash_can.address,
        latitude=trash_can.latitude, longitude=trash_can.longitude,
        type=trash_can.type.split(",")
    )
    if form.validate_on_submit():
        trash_can.name = form.name.data
        trash_can.address = form.address.data
        trash_can.latitude = form.latitude.data
        trash_can.longitude = form.longitude.data
        trash_can.type = ",".join(form.type.data)
        new_filename = save_photo(form.photo.data)
        if new_filename:
            trash_can.photo_filename = new_filename

        db.session.commit()
        return redirect(url_for("detail_page", trash_id=trash_can.id))
    return render_template("edit.html", form=form, item=trash_can)

@app.route("/trash/<int:trash_id>/delete", methods=['POST'])
def delete_page(trash_id):
    trash_can = db.get_or_404(TrashCan, trash_id)
    db.session.delete(trash_can)
    db.session.commit()
    return redirect(url_for("map_page"))


def save_photo(file_storage):
    """アップロードされた写真を保存し、保存先ファイル名を返す。未選択なら None。"""
    # 未選択時は None か filename が空の FileStorage が渡る
    if not file_storage or not file_storage.filename:
        return None
    # 日本語ファイル名は secure_filename で空になり得るため、拡張子だけ流用して UUID で命名
    ext = os.path.splitext(secure_filename(file_storage.filename))[1].lower()
    filename = f"{uuid.uuid4().hex}{ext}"
    file_storage.save(os.path.join(UPLOAD_DIR, filename))
    return filename


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')