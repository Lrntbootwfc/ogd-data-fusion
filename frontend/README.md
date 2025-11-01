from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import re
import os
import requests 
import traceback
from difflib import get_close_matches

app = Flask(__name__)
CORS(app) 

# --- CONFIGURATION ---
API_KEY = "579b464db66ec23bdd00000144e7c0fd16ef44bd774012407adf6a1e" 
OGD_BASE_URL = "https://api.data.gov.in/resource/"

# --- CRITICAL: SET YOUR DATA FILE PATHS HERE ---
# Your actual file structure based on the logs
AGRICULTURE_DATA_PATH = "data/agriculture_production.csv"
CLIMATE_DATA_PATH = "data/annual_rainfall.csv"  # Changed from .xls to .csv

# If you keep the Excel file, install xlrd first:
# pip install xlrd
# Or convert to CSV and use: data/annual_rainfall.csv

# --- API RESOURCE IDs (Backup if files not available) ---
AGRI_RESOURCE_IDS = [
    "f20d7d45-e3d8-4603-bc79-15a3d0db1f9a",  # Production of Different Crops
    "baf78e76-ff2c-4f8d-be2e-9e549eb9f799",  # Yield of Important Crops
    "4ed94214-0ab1-4b9d-aa64-47f98ccdc687",  # Kharif Crops Production
]

CLIMATE_RESOURCE_IDS = [
    "3f373939-30d5-40dd-8c78-f4e9f421415e",  # Annual Rainfall (removed extra '9')
    "84f3123a-56b8-42ac-9d19-3fabe0c3e13e",  # MP Rainfall
    "b59a4532-63cb-47b1-b42a-9fbc13887b3f",  # Karnataka Rainfall
    "2cbb9b86-0d19-4de9-a5c0-8e76813994e4",  # Gujarat Rainfall
]

# --- HELPER: FETCH FROM API ---
def fetch_from_api(resource_id, limit=5000):
    """Fetch data from OGD API."""
    api_url = f"{OGD_BASE_URL}{resource_id}?api-key={API_KEY}&format=json&limit={limit}"
    try:
        print(f"   → Fetching from API: {resource_id[:20]}...")
        response = requests.get(api_url, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if 'records' in data and len(data['records']) > 0:
            df = pd.DataFrame(data['records'])
            print(f"   ✓ Fetched {len(df)} rows from API")
            return df
        else:
            print(f"   ✗ No records in API response")
            return pd.DataFrame()
    except Exception as e:
        print(f"   ✗ API Error: {str(e)[:100]}")
        return pd.DataFrame()

# --- HELPER: LOAD LOCAL FILE ---
def load_local_file(filepath):
    """Load data from local CSV/Excel file."""
    if not os.path.exists(filepath):
        print(f"   ✗ File not found: {filepath}")
        return pd.DataFrame()
    
    try:
        print(f"   → Loading file: {filepath}")
        
        # Try CSV first
        if filepath.endswith('.csv'):
            df = pd.read_csv(filepath, encoding='utf-8', on_bad_lines='skip', engine='python')
        # Try Excel
        elif filepath.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(filepath)
        else:
            print(f"   ✗ Unsupported file format")
            return pd.DataFrame()
        
        print(f"   ✓ Loaded {len(df)} rows from file")
        print(f"   ✓ Columns: {list(df.columns)[:5]}")
        return df
    except Exception as e:
        print(f"   ✗ Error loading file: {str(e)[:100]}")
        return pd.DataFrame()

# --- MAIN DATA LOADING FUNCTION ---
def load_and_clean_data():
    """Load agriculture and climate data from files or APIs."""
    print("\n" + "="*60)
    print("📊 STARTING DATA LOAD")
    print("="*60)
    
    # ========== AGRICULTURE DATA ==========
    print("\n1️⃣  LOADING AGRICULTURE DATA...")
    all_agri_dfs = []
    
    # Try loading from local file first
    agri_df_local = load_local_file(AGRICULTURE_DATA_PATH)
    if not agri_df_local.empty:
        all_agri_dfs.append(agri_df_local)
        print(f"   ✓ Local file added: {len(agri_df_local)} rows")
    
    # ALWAYS fetch from APIs to supplement local data (unless you have 1000+ rows locally)
    if len(all_agri_dfs) == 0 or (len(all_agri_dfs) > 0 and len(all_agri_dfs[0]) < 1000):
        print("   → Supplementing with API data for more comprehensive coverage...")
        for rid in AGRI_RESOURCE_IDS:
            temp_df = fetch_from_api(rid)
            if not temp_df.empty:
                all_agri_dfs.append(temp_df)
    else:
        print("   → Local file has sufficient data, skipping API fetch")
    
    # Combine all agriculture dataframes
    if all_agri_dfs:
        agriculture_df = pd.concat(all_agri_dfs, ignore_index=True)
        print(f"\n   ✓ Combined Agriculture Data: {len(agriculture_df)} rows")
    else:
        agriculture_df = pd.DataFrame()
        print(f"\n   ✗ NO AGRICULTURE DATA LOADED!")
    
    # Clean Agriculture Data
    if not agriculture_df.empty:
        print("   → Cleaning Agriculture data...")
        
        # Normalize column names (handle different naming conventions)
        col_map = {
            # State names
            'state_name': 'State_Name', 'state': 'State_Name', 'State': 'State_Name',
            'St_Nm': 'State_Name', 'st_nm': 'State_Name',  # YOUR FILE FORMAT
            # District names
            'district_name': 'District_Name', 'district': 'District_Name', 'District': 'District_Name',
            'Dist_Nm': 'District_Name', 'dist_nm': 'District_Name',
            # Crop names
            'crop_name': 'Crop_Name', 'crop': 'Crop_Name', 'Crop': 'Crop_Name',
            'Crop_Name': 'Crop_Name',  # YOUR FILE FORMAT
            # Production
            'production': 'Production', 'Production (in tonnes)': 'Production',
            'Production': 'Production',  # YOUR FILE FORMAT
            # Yield
            'yield': 'Yield', 'Yield (Kg per Hectare)': 'Yield',
            # Area
            'area': 'Area', 'Area (in Hectares)': 'Area',
            # Year
            'crop_year': 'Year', 'year': 'Year', 'Year': 'Year', 'season_year': 'Year',
            'Crop_Year': 'Year',  # YOUR FILE FORMAT
            'value': 'Production',
        }
        
        # Print columns before rename for debugging
        print(f"   → Original columns: {list(agriculture_df.columns)}")
        agriculture_df.rename(columns=col_map, inplace=True)
        print(f"   → Renamed columns: {list(agriculture_df.columns)}")
        
        # Ensure key columns exist
        for col in ['State_Name', 'District_Name', 'Crop_Name', 'Production', 'Year']:
            if col not in agriculture_df.columns:
                agriculture_df[col] = np.nan
        
        # Clean text columns
        agriculture_df['State_Name'] = agriculture_df['State_Name'].astype(str).str.upper().str.strip()
        agriculture_df['District_Name'] = agriculture_df['District_Name'].astype(str).str.upper().str.strip()
        agriculture_df['Crop_Name'] = agriculture_df['Crop_Name'].astype(str).str.upper().str.strip()
        
        # Clean numeric columns
        agriculture_df['Year'] = pd.to_numeric(agriculture_df['Year'], errors='coerce').fillna(0).astype(int)
        agriculture_df['Production'] = pd.to_numeric(agriculture_df['Production'], errors='coerce').fillna(0)
        
        if 'Yield' in agriculture_df.columns:
            agriculture_df['Yield'] = pd.to_numeric(agriculture_df['Yield'], errors='coerce').fillna(0)
        if 'Area' in agriculture_df.columns:
            agriculture_df['Area'] = pd.to_numeric(agriculture_df['Area'], errors='coerce').fillna(0)
        
        # Remove invalid rows (BUT BE CAREFUL NOT TO REMOVE ALL DATA)
        initial_count = len(agriculture_df)
        agriculture_df = agriculture_df[agriculture_df['Year'] >= 1900]
        print(f"   → After year filter (>=1900): {len(agriculture_df)} rows (removed {initial_count - len(agriculture_df)})")
        
        # Only remove NAN states, not empty strings
        agriculture_df = agriculture_df[~agriculture_df['State_Name'].isin(['NAN', 'nan', ''])]
        print(f"   → After removing NAN states: {len(agriculture_df)} rows")
        
        print(f"   ✓ Cleaned Agriculture Data: {len(agriculture_df)} rows")
        print(f"   ✓ States: {agriculture_df['State_Name'].nunique()}")
        print(f"   ✓ Crops: {agriculture_df['Crop_Name'].nunique()}")
        print(f"   ✓ Year Range: {agriculture_df['Year'].min()} - {agriculture_df['Year'].max()}")
    
    # ========== CLIMATE DATA ==========
    print("\n2️⃣  LOADING CLIMATE DATA...")
    all_climate_dfs = []
    
    # Try loading from local file first
    climate_df_local = load_local_file(CLIMATE_DATA_PATH)
    if not climate_df_local.empty:
        all_climate_dfs.append(climate_df_local)
    else:
        # If Excel file failed, suggest converting to CSV
        if CLIMATE_DATA_PATH.endswith(('.xls', '.xlsx')):
            print("   💡 TIP: Convert Excel file to CSV for better compatibility")
            print("      Option 1: Open in Excel and 'Save As' -> CSV")
            print("      Option 2: Install xlrd: pip install xlrd")
            print("      Option 3: Install openpyxl: pip install openpyxl")
    
    # If local file failed, try APIs
    if not all_climate_dfs:
        print("   → Local file not available, trying APIs...")
        for rid in CLIMATE_RESOURCE_IDS:
            temp_df = fetch_from_api(rid)
            if not temp_df.empty:
                all_climate_dfs.append(temp_df)
    
    # Combine all climate dataframes
    if all_climate_dfs:
        climate_df = pd.concat(all_climate_dfs, ignore_index=True)
        print(f"\n   ✓ Combined Climate Data: {len(climate_df)} rows")
    else:
        climate_df = pd.DataFrame()
        print(f"\n   ✗ NO CLIMATE DATA LOADED!")
    
    # Clean Climate Data
    if not climate_df.empty:
        print("   → Cleaning Climate data...")
        
        # Normalize column names
        col_map = {
            # State/District names
            'state_name': 'State_Name', 'state': 'State_Name', 'State': 'State_Name',
            'district_name': 'State_Name', 'district': 'State_Name', 'District': 'State_Name',
            'subdivision': 'State_Name', 'sub_division': 'State_Name',
            'Dist_Name': 'State_Name', 'dist_name': 'State_Name',
            'ST_Name': 'State_Name', 'st_name': 'State_Name',  # YOUR FILE FORMAT
            # Rainfall
            'annual': 'Rainfall', 'rainfall': 'Rainfall', 'Rainfall': 'Rainfall',
            'annual_rainfall': 'Rainfall', 'annual_average_rainfall_mm': 'Rainfall',
            'rain_mm': 'Rainfall', 'ANNUAL_RAIN': 'Rainfall', 'Annual': 'Rainfall',
            'ANNUAL': 'Rainfall',  # YOUR FILE FORMAT - this is the key one!
            # Year
            'year_code': 'Year', 'rain_year': 'Year', 'year': 'Year', 'Year': 'Year', 
            'YR': 'Year', 'Yr': 'Year',
            'YEAR': 'Year',  # YOUR FILE FORMAT - this is critical!
        }
        
        print(f"   → Original columns: {list(climate_df.columns)}")
        climate_df.rename(columns=col_map, inplace=True)
        print(f"   → Renamed columns: {list(climate_df.columns)}")
        
        # Ensure key columns exist
        for col in ['State_Name', 'Rainfall', 'Year']:
            if col not in climate_df.columns:
                climate_df[col] = np.nan
        
        # Clean columns
        climate_df['State_Name'] = climate_df['State_Name'].astype(str).str.upper().str.strip()
        climate_df['Year'] = pd.to_numeric(climate_df['Year'], errors='coerce').fillna(0).astype(int)
        climate_df['Rainfall'] = pd.to_numeric(climate_df['Rainfall'], errors='coerce').fillna(0)
        
        # Remove invalid rows (BE CAREFUL)
        initial_count = len(climate_df)
        climate_df = climate_df[climate_df['Year'] >= 1900]
        print(f"   → After year filter (>=1900): {len(climate_df)} rows (removed {initial_count - len(climate_df)})")
        
        climate_df = climate_df[~climate_df['State_Name'].isin(['NAN', 'nan', ''])]
        print(f"   → After removing NAN states: {len(climate_df)} rows")
        
        # Don't remove zero rainfall - it might be valid data
        # climate_df = climate_df[climate_df['Rainfall'] > 0]
        
        print(f"   ✓ Cleaned Climate Data: {len(climate_df)} rows")
        print(f"   ✓ States: {climate_df['State_Name'].nunique()}")
        print(f"   ✓ Year Range: {climate_df['Year'].min()} - {climate_df['Year'].max()}")
    
    print("\n" + "="*60)
    print("📊 DATA LOAD COMPLETE")
    print("="*60 + "\n")
    
    return agriculture_df, climate_df

# Load data globally
AGRICULTURE_DF, CLIMATE_DF = load_and_clean_data()

# Calculate latest year
def get_latest_year():
    if not AGRICULTURE_DF.empty and 'Year' in AGRICULTURE_DF.columns:
        valid_years = AGRICULTURE_DF[AGRICULTURE_DF['Year'] > 1900]['Year']
        if not valid_years.empty:
            return int(valid_years.max())
    return 2017

LATEST_AGRI_YEAR = get_latest_year()

# --- ENTITY EXTRACTION ---
def extract_states(question):
    """Extract state names from question."""
    if AGRICULTURE_DF.empty and CLIMATE_DF.empty:
        return []
    
    all_states = set()
    if 'State_Name' in AGRICULTURE_DF.columns:
        all_states.update(AGRICULTURE_DF['State_Name'].dropna().unique())
    if 'State_Name' in CLIMATE_DF.columns:
        all_states.update(CLIMATE_DF['State_Name'].dropna().unique())
    
    all_states = [s for s in all_states if s and s != 'NAN']
    
    question_upper = question.upper()
    found_states = []
    
    # Direct match
    for state in all_states:
        if state in question_upper:
            found_states.append(state)
    
    # Fuzzy match
    if not found_states:
        words = question_upper.split()
        for word in words:
            if len(word) > 3:
                matches = get_close_matches(word, all_states, n=1, cutoff=0.8)
                if matches:
                    found_states.append(matches[0])
    
    return list(set(found_states))[:2]

def extract_crops(question):
    """Extract crop names from question."""
    if AGRICULTURE_DF.empty or 'Crop_Name' not in AGRICULTURE_DF.columns:
        return []
    
    all_crops = AGRICULTURE_DF['Crop_Name'].dropna().unique().tolist()
    question_upper = question.upper()
    found_crops = []
    
    for crop in all_crops:
        if crop in question_upper:
            found_crops.append(crop)
    
    return found_crops

def extract_years(question):
    """Extract years from question."""
    year_pattern = r'\b(19|20)\d{2}\b'
    years = re.findall(year_pattern, question)
    return [int(y) for y in years]

# --- Q&A FUNCTIONS ---

def compare_states(states):
    """Compare rainfall and crops between two states."""
    response = {"answer": "", "sources": []}
    
    if len(states) < 2:
        states = ['MAHARASHTRA', 'GUJARAT']
    
    state1, state2 = states[0], states[1]
    response['answer'] += f"## Comparison: {state1} vs {state2}\n\n"
    response['answer'] += f"*(Data up to {LATEST_AGRI_YEAR})*\n\n"
    
    # Rainfall Comparison
    if not CLIMATE_DF.empty:
        s1_rain = CLIMATE_DF[CLIMATE_DF['State_Name'].str.contains(state1, na=False)]
        s2_rain = CLIMATE_DF[CLIMATE_DF['State_Name'].str.contains(state2, na=False)]
        
        if not s1_rain.empty and not s2_rain.empty:
            avg_s1 = s1_rain['Rainfall'].mean()
            avg_s2 = s2_rain['Rainfall'].mean()
            
            response['answer'] += f"### 🌧️ Rainfall Comparison\n"
            response['answer'] += f"- **{state1}**: {avg_s1:.2f} mm (average annual)\n"
            response['answer'] += f"- **{state2}**: {avg_s2:.2f} mm (average annual)\n"
            response['answer'] += f"- **Difference**: {abs(avg_s1 - avg_s2):.2f} mm\n\n"
    
    # Crop Production Comparison
    if not AGRICULTURE_DF.empty:
        s1_crops = AGRICULTURE_DF[AGRICULTURE_DF['State_Name'].str.contains(state1, na=False)]
        s2_crops = AGRICULTURE_DF[AGRICULTURE_DF['State_Name'].str.contains(state2, na=False)]
        
        if not s1_crops.empty:
            top_s1 = s1_crops.groupby('Crop_Name')['Production'].sum().nlargest(5)
            response['answer'] += f"### 🌾 Top 5 Crops in {state1}\n"
            for i, (crop, prod) in enumerate(top_s1.items(), 1):
                response['answer'] += f"{i}. **{crop}**: {prod/1000:.2f}k tonnes\n"
            response['answer'] += "\n"
        
        if not s2_crops.empty:
            top_s2 = s2_crops.groupby('Crop_Name')['Production'].sum().nlargest(5)
            response['answer'] += f"### 🌾 Top 5 Crops in {state2}\n"
            for i, (crop, prod) in enumerate(top_s2.items(), 1):
                response['answer'] += f"{i}. **{crop}**: {prod/1000:.2f}k tonnes\n"
    
    response['sources'].append({"name": "Agriculture & Climate Database", "url": "data.gov.in"})
    return response

def find_highest_lowest(metric, crop=None, state=None):
    """Find highest or lowest production."""
    response = {"answer": "", "sources": []}
    
    if AGRICULTURE_DF.empty:
        response['answer'] = "No agriculture data available."
        return response
    
    df = AGRICULTURE_DF.copy()
    
    if state:
        df = df[df['State_Name'].str.contains(state, na=False)]
    if crop:
        df = df[df['Crop_Name'].str.contains(crop, na=False)]
    
    df = df[df['Production'] > 0]
    
    if df.empty:
        response['answer'] = "No matching data found."
        return response
    
    if metric == 'highest':
        result = df.loc[df['Production'].idxmax()]
        response['answer'] += f"## 🏆 Highest Production\n\n"
    else:
        result = df.loc[df['Production'].idxmin()]
        response['answer'] += f"## 📉 Lowest Production\n\n"
    
    response['answer'] += f"- **Crop**: {result.get('Crop_Name', 'N/A')}\n"
    response['answer'] += f"- **State**: {result.get('State_Name', 'N/A')}\n"
    if 'District_Name' in result and result['District_Name'] != 'NAN':
        response['answer'] += f"- **District**: {result.get('District_Name', 'N/A')}\n"
    response['answer'] += f"- **Production**: {result.get('Production', 0)/1000:.2f}k tonnes\n"
    response['answer'] += f"- **Year**: {result.get('Year', 'N/A')}\n"
    
    response['sources'].append({"name": "Agriculture Database", "url": "data.gov.in"})
    return response

def analyze_trend(state=None, crop=None):
    """Analyze production trends."""
    response = {"answer": "", "sources": []}
    
    if AGRICULTURE_DF.empty:
        response['answer'] = "No agriculture data available."
        return response
    
    df = AGRICULTURE_DF.copy()
    
    if state:
        df = df[df['State_Name'].str.contains(state, na=False)]
    if crop:
        df = df[df['Crop_Name'].str.contains(crop, na=False)]
    
    if df.empty or len(df) < 2:
        response['answer'] = "Insufficient data for trend analysis."
        return response
    
    # Production trend
    yearly = df.groupby('Year')['Production'].sum().sort_index()
    
    if len(yearly) > 1:
        change = ((yearly.iloc[-1] - yearly.iloc[0]) / yearly.iloc[0] * 100)
        
        response['answer'] += f"## 📈 Trend Analysis\n\n"
        if state:
            response['answer'] += f"**State**: {state}\n"
        if crop:
            response['answer'] += f"**Crop**: {crop}\n"
        response['answer'] += f"**Period**: {yearly.index[0]} to {yearly.index[-1]}\n"
        response['answer'] += f"**Change**: {change:+.2f}%\n"
        response['answer'] += f"**Direction**: {'📈 Increasing' if change > 0 else '📉 Decreasing'}\n"
    
    response['sources'].append({"name": "Agriculture Database", "url": "data.gov.in"})
    return response

def get_crop_info(crop, state=None):
    """Get information about a specific crop."""
    response = {"answer": "", "sources": []}
    
    if AGRICULTURE_DF.empty:
        response['answer'] = "No agriculture data available."
        return response
    
    df = AGRICULTURE_DF[AGRICULTURE_DF['Crop_Name'].str.contains(crop, na=False)]
    if state:
        df = df[df['State_Name'].str.contains(state, na=False)]
    
    if df.empty:
        response['answer'] = f"No data found for {crop}" + (f" in {state}" if state else "")
        return response
    
    response['answer'] += f"## 🌾 {crop} Statistics\n\n"
    if state:
        response['answer'] += f"**State**: {state}\n"
    
    total_prod = df['Production'].sum()
    avg_prod = df['Production'].mean()
    
    response['answer'] += f"- **Total Production**: {total_prod/1000:.2f}k tonnes\n"
    response['answer'] += f"- **Average Production**: {avg_prod/1000:.2f}k tonnes\n"
    
    if 'Year' in df.columns:
        response['answer'] += f"- **Data Period**: {df['Year'].min()} - {df['Year'].max()}\n"
    
    if 'State_Name' in df.columns and not state:
        top_states = df.groupby('State_Name')['Production'].sum().nlargest(3)
        response['answer'] += f"\n**Top 3 Producing States**:\n"
        for i, (st, prod) in enumerate(top_states.items(), 1):
            response['answer'] += f"{i}. {st}: {prod/1000:.2f}k tonnes\n"
    
    response['sources'].append({"name": "Crop Database", "url": "data.gov.in"})
    return response

def get_rainfall_info(state):
    """Get rainfall information for a state."""
    response = {"answer": "", "sources": []}
    
    if CLIMATE_DF.empty:
        response['answer'] = "No climate data available."
        return response
    
    df = CLIMATE_DF[CLIMATE_DF['State_Name'].str.contains(state, na=False)]
    
    if df.empty:
        response['answer'] = f"No rainfall data found for {state}."
        return response
    
    response['answer'] += f"## 🌧️ Rainfall Data: {state}\n\n"
    response['answer'] += f"- **Average Rainfall**: {df['Rainfall'].mean():.2f} mm\n"
    response['answer'] += f"- **Maximum Rainfall**: {df['Rainfall'].max():.2f} mm\n"
    response['answer'] += f"- **Minimum Rainfall**: {df['Rainfall'].min():.2f} mm\n"
    
    if 'Year' in df.columns:
        response['answer'] += f"- **Data Period**: {df['Year'].min()} - {df['Year'].max()}\n"
    
    response['sources'].append({"name": "Climate Database", "url": "data.gov.in"})
    return response

# --- INTELLIGENT QUERY PROCESSOR ---

def process_question(question):
    """Main intelligence layer - routes question to appropriate function."""
    q = question.upper()
    
    # Extract entities
    states = extract_states(question)
    crops = extract_crops(question)
    years = extract_years(question)
    
    # Pattern matching
    if re.search(r'COMPAR[EI]', q):
        return compare_states(states if len(states) >= 2 else ['MAHARASHTRA', 'GUJARAT'])
    
    if re.search(r'(HIGHEST|MAXIMUM|MAX|TOP|BEST)', q):
        crop = crops[0] if crops else None
        state = states[0] if states else None
        return find_highest_lowest('highest', crop, state)
    
    if re.search(r'(LOWEST|MINIMUM|MIN|BOTTOM|WORST)', q):
        crop = crops[0] if crops else None
        state = states[0] if states else None
        return find_highest_lowest('lowest', crop, state)
    
    if re.search(r'(TREND|CORRELAT|ANALYZ|PATTERN|CHANGE)', q):
        return analyze_trend(states[0] if states else None, crops[0] if crops else None)
    
    if crops and re.search(r'(STATISTIC|INFO|DATA|DETAIL|ABOUT|PRODUCTION)', q):
        return get_crop_info(crops[0], states[0] if states else None)
    
    if re.search(r'(RAINFALL|RAIN|PRECIPITAT|CLIMATE|WEATHER)', q):
        if states:
            return get_rainfall_info(states[0])
    
    # Default
    return {
        "answer": "❌ Unable to understand the question.\n\n**Try asking:**\n- Compare Maharashtra and Gujarat\n- Which state has highest rice production?\n- Show me wheat statistics\n- What is the rainfall in Kerala?\n- Analyze production trend in Punjab",
        "sources": []
    }

# --- FLASK ROUTES ---

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "running",
        "agriculture_rows": len(AGRICULTURE_DF),
        "climate_rows": len(CLIMATE_DF),
        "latest_year": LATEST_AGRI_YEAR,
        "data_loaded": not (AGRICULTURE_DF.empty and CLIMATE_DF.empty)
    })

@app.route('/api/test', methods=['GET'])
def test_endpoint():
    """Test endpoint."""
    return jsonify({"message": "Backend is working!", "timestamp": pd.Timestamp.now().isoformat()})

@app.route('/api/query', methods=['POST'])
def handle_query():
    """Main query endpoint."""
    print("\n=== NEW REQUEST ===")
    
    if AGRICULTURE_DF.empty and CLIMATE_DF.empty:
        print("ERROR: No data loaded!")
        return jsonify({
            "answer": "**❌ CRITICAL ERROR**\n\nNo data is loaded. Please ensure:\n1. CSV files are in the same folder as app.py\n2. Files are named correctly\n3. API key is valid\n\nCheck terminal for detailed error messages.",
            "sources": []
        }), 500
    
    try:
        data = request.get_json()
        question = data.get('question', '')
        print(f"Question: {question}")
        
        if not question:
            return jsonify({"error": "No question provided"}), 400
        
        result = process_question(question)
        print(f"Response generated successfully")
        return jsonify(result)
        
    except Exception as e:
        print("ERROR:", str(e))
        traceback.print_exc()
        return jsonify({"error": f"Internal error: {str(e)}"}), 500

if __name__ == '__main__':
    print("\n" + "="*60)
    print("🚀 BACKEND SERVER STARTING")
    print("="*60)
    print(f"✓ Agriculture Rows: {len(AGRICULTURE_DF)}")
    print(f"✓ Climate Rows: {len(CLIMATE_DF)}")
    print(f"✓ Latest Year: {LATEST_AGRI_YEAR}")
    print(f"✓ Server: http://127.0.0.1:5000")
    print("="*60)
    
    if AGRICULTURE_DF.empty and CLIMATE_DF.empty:
        print("\n⚠️  WARNING: NO DATA LOADED!")
        print("\n📝 QUICK FIX:")
        print("1. Put your CSV files in the same folder as app.py")
        print("2. Name them: agriculture_production.csv and annual_rainfall.csv")
        print("3. Or update file paths at the top of this script")
        print("\nCheck the detailed logs above for specific errors.")
    
    print("\n")
    app.run(debug=True, host='127.0.0.1', port=5000)