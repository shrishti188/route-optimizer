# 🗺️ Live Location Tracker & Route Optimizer (Work Sites Planner)

**Live demo:** https://destinationcheck.netlify.app/  

A web application that helps you plan and travel efficiently among multiple work sites. Ideal for fieldwork, inspections, deliveries, or any use-case with multiple stops.

---

## 📌 Features

- **Real-time location tracking**: Displays your moving location as you travel  
- **Add up to 10 sites**: Enter destinations by name or pick on map  
- **Automatic geocoding**: Converts site names to coordinates (Nominatim / OpenStreetMap)  
- **Nearest site detection**: Dynamically finds which site is closest to you  
- **Route optimization**: Uses Nearest Neighbor + 2-Opt algorithm to compute efficient route  
- **Visual map view**: All sites and route drawn on map (Leaflet)  
- **Google Maps integration**: One-click “Open Optimized Route in Google Maps”  
- **Persistent storage**: Saves your sites and starting point using browser `localStorage`  
- **Map picking**: Pick start or destination directly by tapping on map  


## 🛠️ Tech Stack

- **Frontend**: HTML, CSS, JavaScript  
- **Mapping**: Leaflet.js with OpenStreetMap tiles  
- **Geocoding**: Nominatim API  
- **Algorithms**: Haversine formula, Nearest Neighbor, 2-Opt  
- **Storage**: localStorage for persisting user data  

---

## 🚀 How to Use

1. Go to [Live demo](https://destinationcheck.netlify.app/)  
2. Allow location permission when browser asks  
3. Add your work sites (up to 10)  
4. (Optional) Set a manual start location  
5. Click **“Detect My Location”**  
6. View **Nearest Site** and **Route Order**  
7. Click **“Open Optimized Route in Google Maps”** to start navigation  

---

## 🧩 Code Overview & Highlights

### 🔹 Route Optimization

Your algorithm finds an efficient visiting order by:

1. Selecting the nearest unvisited site (Nearest Neighbor)  
2. Refining with 2-Opt swaps for shorter total distance  

### 🔹 Distance Calculation

Uses **Haversine formula** (valid for earth’s curvature) for computing distances between lat/lon pairs.

### 🔹 Live Tracking

`navigator.geolocation.watchPosition()` tracks movement and updates map in real time.

### 🔹 Persistence

Sites and manual start points are stored in `localStorage` so they persist across sessions.

---

## 🔧 How to Run Locally

1. Clone this repo  
2. Open `index.html` in a modern browser (or use **Live Server** in VS Code)  
3. Make sure you have internet (for map tiles & geocoding)  
4. Test all features (add sites, detect location, open route in Google Maps)


## 🙋 Author
Shrishti Sharma  
Creator & front-end developer  
📧 shrishtisharma59@gmail.com
