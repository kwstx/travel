import pandas as pd
import logging

logger = logging.getLogger(__name__)

# Real historical dataset from GitHub (Ease My Trip scraped dataset)
DATASET_URL = "https://raw.githubusercontent.com/SayamAlt/Flight-Price-Prediction/master/Data_Train.csv"

# Alternate if the above doesn't work, we can fallback to another dataset
# url = "https://raw.githubusercontent.com/SayamAlt/Flight-Price-Prediction/master/Data_Train.csv"

_df_cache = None

def load_historical_fare_data() -> pd.DataFrame:
    """
    Loads historical flight fare data from a public dataset.
    This uses a real scraped dataset (Ease My Trip) commonly used for ML.
    """
    global _df_cache
    if _df_cache is not None:
        return _df_cache

    try:
        logger.info(f"Downloading historical fare data from {DATASET_URL}")
        # Assuming the standard Kaggle dataset format
        df = pd.read_csv(DATASET_URL)
        
        # Data cleaning and formatting for Prophet
        # Prophet expects 'ds' (datestamp) and 'y' (target)
        
        # Handle 'Date_of_Journey' format which is typically DD/MM/YYYY
        df['ds'] = pd.to_datetime(df['Date_of_Journey'], format='%d/%m/%Y', errors='coerce')
        
        # Price is 'Price'
        df['y'] = df['Price']
        
        # Filter out invalid dates or prices
        df = df.dropna(subset=['ds', 'y'])
        
        logger.info(f"Successfully loaded {len(df)} historical fare records.")
        _df_cache = df
        return df
    except Exception as e:
        logger.error(f"Failed to load historical fare data: {e}")
        # Return an empty dataframe with correct columns as fallback to avoid crashes
        return pd.DataFrame(columns=['Airline', 'Source', 'Destination', 'ds', 'y'])

def get_route_data(source: str, destination: str) -> pd.DataFrame:
    """
    Returns historical data filtered for a specific route.
    """
    df = load_historical_fare_data()
    if df.empty:
        return df
        
    route_df = df[(df['Source'].str.lower() == source.lower()) & 
                  (df['Destination'].str.lower() == destination.lower())]
    return route_df[['ds', 'y']].sort_values(by='ds')
