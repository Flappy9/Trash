import wtforms.validators as validators
from flask_wtf import FlaskForm
from wtforms.fields import(
    StringField, IntegerField, PasswordField, DateField,
    RadioField, SelectField, BooleanField, TextAreaField,
    EmailField, SubmitField, FloatField, SelectMultipleField, 

)
from flask_wtf.file import FileField, FileAllowed
from constants import GARBAGE_TYPES
from wtforms.widgets import ListWidget, CheckboxInput

class AddGarbageForm(FlaskForm):
    name = StringField("名前: ", validators=[validators.input_required(message="名前を入力してください")],
                    render_kw={"placeholder":"(例)東京駅地下中央口改札前"})
    address = StringField("住所: ")
    latitude = FloatField("緯度: ", [validators.input_required(),
                                   validators.NumberRange(-90, 90)])
    longitude = FloatField("経度: ", [validators.input_required(),
                                   validators.NumberRange(-180, 180)])
    type = SelectMultipleField("ゴミの種類: ", choices=GARBAGE_TYPES, validators=[validators.input_required()],
                                            widget=ListWidget(prefix_label=False),
                                            option_widget=CheckboxInput())
    photo = FileField(
        "写真: ",
        validators=[
            validators.Optional(),
            FileAllowed(["jpg", "jpeg", "png", "gif"], "画像ファイル（jpg, jpeg, png, gif）のみアップロードできます")
        ]
    )
    
    submit = SubmitField('登録')