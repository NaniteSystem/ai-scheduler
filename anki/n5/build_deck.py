"""Собирает колоду Anki «JLPT N5 — 単語» из n5_vocab.tsv.

Запуск: pip install genanki && python3 build_deck.py
Результат: JLPT_N5_vocab.apkg
"""
import csv
import os

import genanki

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "n5_vocab.tsv")
OUT = os.path.join(HERE, "JLPT_N5_vocab.apkg")

# Фиксированные ID, чтобы повторный импорт обновлял колоду, а не дублировал её.
MODEL_ID = 1729384756
DECK_ID = 2059384712

CSS = """
.card { font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif;
        font-size: 22px; text-align: center; color: #222; background: #fafafa; }
.nightMode.card, .night_mode .card { color: #eee; background: #2b2b2b; }
.jp-big { font-size: 64px; margin: 20px 0; }
.kana { font-size: 34px; color: #2a7ae2; }
.ru { font-size: 26px; margin-top: 12px; }
.hint { font-size: 14px; color: #999; margin-bottom: 8px; }
.tag { font-size: 13px; color: #aaa; margin-top: 16px; }
"""

model = genanki.Model(
    MODEL_ID,
    "JLPT N5 (кандзи / кана / русский)",
    fields=[{"name": "Kanji"}, {"name": "Kana"}, {"name": "Russian"}, {"name": "Category"}],
    sort_field_index=1,
    css=CSS,
    templates=[
        {
            # Создаётся только для слов, у которых есть запись иероглифами.
            "name": "1. Иероглифы → чтение и перевод",
            "qfmt": '{{#Kanji}}<div class="hint">漢字 → ?</div><div class="jp-big">{{Kanji}}</div>{{/Kanji}}',
            "afmt": '{{FrontSide}}<hr id="answer"><div class="kana">{{Kana}}</div>'
                    '<div class="ru">{{Russian}}</div><div class="tag">{{Category}}</div>',
        },
        {
            "name": "2. Кана → перевод",
            "qfmt": '<div class="hint">かな → ?</div><div class="jp-big">{{Kana}}</div>',
            "afmt": '{{FrontSide}}<hr id="answer">{{#Kanji}}<div class="kana">{{Kanji}}</div>{{/Kanji}}'
                    '<div class="ru">{{Russian}}</div><div class="tag">{{Category}}</div>',
        },
        {
            "name": "3. Русский → японский",
            "qfmt": '<div class="hint">RU → 日本語</div><div class="ru">{{Russian}}</div>'
                    '<div class="tag">{{Category}}</div>',
            "afmt": '{{FrontSide}}<hr id="answer">{{#Kanji}}<div class="jp-big">{{Kanji}}</div>{{/Kanji}}'
                    '<div class="kana">{{Kana}}</div>',
        },
    ],
)


class Note(genanki.Note):
    @property
    def guid(self):
        return genanki.guid_for(self.fields[0], self.fields[1], self.fields[2])


def main():
    deck = genanki.Deck(DECK_ID, "JLPT N5::単語 (словарь)")
    with open(SRC, encoding="utf-8") as f:
        rows = [r for r in csv.reader(f, delimiter="\t") if r and not r[0].startswith("#")]
    for kanji, kana, ru, cat in rows:
        tags = ["N5", cat.replace(" ", "_")]
        tags.append("с_кандзи" if kanji else "только_кана")
        deck.add_note(Note(model=model, fields=[kanji, kana, ru, cat], tags=tags))
    genanki.Package(deck).write_to_file(OUT)
    with_kanji = sum(1 for r in rows if r[0])
    print(f"{len(rows)} слов ({with_kanji} с иероглифами, {len(rows) - with_kanji} только каной) -> {OUT}")


if __name__ == "__main__":
    main()
