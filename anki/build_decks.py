"""Собирает колоды Anki JLPT N5–N2 (単語) из nX/nX_vocab.tsv.

Запуск: pip install genanki && python3 build_decks.py
Результат: nX/JLPT_NX_vocab.apkg для каждого уровня и JLPT_all_vocab.apkg со всеми сразу.

Слово, которое уже есть на более низком уровне, в старший уровень не попадает.
"""
import csv
import os
import re

import genanki

HERE = os.path.dirname(os.path.abspath(__file__))
LEVELS = ["n5", "n4", "n3", "n2"]  # от простого к сложному: порядок важен для удаления дублей

# Фиксированные ID, чтобы повторный импорт обновлял колоды, а не дублировал их.
MODEL_ID = 1729384756
DECK_IDS = {"n5": 2059384712, "n4": 2059384713, "n3": 2059384714, "n2": 2059384715}

CJK = re.compile(r"[㐀-鿿々]")

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
    "JLPT (кандзи / кана / русский)",
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


def read_rows(level):
    with open(os.path.join(HERE, level, f"{level}_vocab.tsv"), encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            if not row or row[0].startswith("#"):
                continue
            kanji, kana, ru, cat = (c.strip() for c in row)
            if not CJK.search(kanji):  # «あいにく / あいにく» → слово без иероглифов
                kanji = ""
            yield kanji, kana, ru, cat


def main():
    seen = set()
    decks = []
    for level in LEVELS:
        deck = genanki.Deck(DECK_IDS[level], f"JLPT::{level.upper()} 単語")
        skipped = 0
        for kanji, kana, ru, cat in read_rows(level):
            key = (kanji, kana)
            if key in seen:
                skipped += 1
                continue
            seen.add(key)
            tags = [level.upper(), cat.replace(" ", "_"), "с_кандзи" if kanji else "только_кана"]
            deck.add_note(Note(model=model, fields=[kanji, kana, ru, cat], tags=tags))
        out = os.path.join(HERE, level, f"JLPT_{level.upper()}_vocab.apkg")
        genanki.Package(deck).write_to_file(out)
        with_kanji = sum(1 for n in deck.notes if n.fields[0])
        print(f"{level.upper()}: {len(deck.notes)} слов ({with_kanji} с иероглифами), "
              f"пропущено дублей: {skipped} -> {os.path.relpath(out, HERE)}")
        decks.append(deck)
    genanki.Package(decks).write_to_file(os.path.join(HERE, "JLPT_all_vocab.apkg"))
    print(f"Всего: {len(seen)} слов -> JLPT_all_vocab.apkg")


if __name__ == "__main__":
    main()
