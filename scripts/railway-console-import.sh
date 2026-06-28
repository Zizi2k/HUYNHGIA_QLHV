#!/bin/sh
# Chay trong Railway MySQL -> tab Console (bash)
# Import schema tu GitHub vao database railway

curl -fsSL "https://raw.githubusercontent.com/Zizi2k/HUYNHGIA_QLHV/main/database/schema.sql" \
  | tail -n +4 \
  | mysql -h mysql.railway.internal -P 3306 -u root -p"${MYSQLPASSWORD}" "${MYSQLDATABASE}"

mysql -h mysql.railway.internal -P 3306 -u root -p"${MYSQLPASSWORD}" "${MYSQLDATABASE}" -e "SHOW TABLES; SELECT username, role FROM users;"
