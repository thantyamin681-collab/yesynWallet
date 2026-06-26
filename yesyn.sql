CREATE DATABASE IF NOT EXISTS yesyn_wallet;
USE yesyn_wallet;
show tables;
-- ၁။ အသုံးပြုသူ Login အကောင့်စာရင်း သိမ်းဆည်းရန် Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ၂။ အသုံးပြုသူများ၏ ကိုယ်ရေးအချက်အလက် (Profile Info) သိမ်းဆည်းရန် Table
CREATE TABLE IF NOT EXISTS user_profile (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE,                               -- users table မှ id နှင့် လာချိတ်ပါမည်
    full_name VARCHAR(100) DEFAULT NULL,
    email VARCHAR(100) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    date_of_birth DATE DEFAULT NULL,
    bio TEXT DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ၃။ ဝင်ငွေ/ထွက်ငွေ ရာဇဝင် (Wallet History) သိမ်းဆည်းရန် Table
CREATE TABLE IF NOT EXISTS wallet_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,                                      -- မည်သည့်အသုံးပြုသူဖြစ်ကြောင်း သတ်မှတ်ရန်
    type ENUM('income', 'outcome') NOT NULL,          -- ဝင်ငွေ သို့မဟုတ် ထွက်ငွေ
    amount DECIMAL(10, 2) NOT NULL,                   -- ပမာဏ
    description TEXT,                                 -- အကြောင်းအရာ
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

USE yesyn_wallet;
select * from users;
-- user_profile table အား အပြီးသတ် ဖျက်ဆီးပစ်မည့် Query
DROP TABLE IF EXISTS user_profile;