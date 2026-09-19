import urllib.request
try:
    r = urllib.request.urlopen('http://localhost:3000')
    print("Status:", r.status)
except Exception as e:
    print("Error:", e)
