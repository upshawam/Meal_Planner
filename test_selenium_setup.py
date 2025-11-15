#!/usr/bin/env python3
"""
Test Selenium setup with built-in driver management.
No need to install chromedriver.exe manually.
"""

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

def main():
    print("Testing Selenium + Chrome setup...")

    # Configure Chrome options
    options = Options()
    options.add_argument("--headless")  # run without opening a window (optional)
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")

    try:
        # Selenium 4.6+ automatically downloads the right ChromeDriver
        driver = webdriver.Chrome(options=options)
        print("✅ Chrome driver started successfully")

        # Test navigation
        driver.get("https://example.com")
        print("Page title:", driver.title)

        driver.quit()
        print("✅ Test completed successfully")

    except Exception as e:
        print("❌ Chrome driver test failed:", e)

if __name__ == "__main__":
    main()
