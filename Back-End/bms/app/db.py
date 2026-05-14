import pymysql
from dbutils.pooled_db import PooledDB

pool = PooledDB(
    creator=pymysql,
    maxconnections=10,
    mincached=2,
    maxcached=5,
    blocking=True,
    host='localhost',
    user='root',
    password='root',
    database='bms_db',
    cursorclass=pymysql.cursors.DictCursor
)

def get_connection():
    return pool.connection()