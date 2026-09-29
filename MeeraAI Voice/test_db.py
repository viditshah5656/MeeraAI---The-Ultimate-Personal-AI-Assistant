import sqlite3
db = sqlite3.connect(r'C:\MeeraAI\.meera\runtime\meera.db')
print(db.execute('SELECT * FROM pronunciations').fetchall())