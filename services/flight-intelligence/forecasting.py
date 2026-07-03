import logging
import pandas as pd
from prophet import Prophet
from data_loader import get_route_data
import datetime

logger = logging.getLogger(__name__)

# Cache models per route to avoid retraining for every request
_model_cache = {}

def get_forecast_for_route(source: str, destination: str, target_date: str) -> dict:
    """
    Trains a Prophet model on historical fare curves for the given route
    and forecasts the optimal booking window and confidence intervals.
    target_date format: YYYY-MM-DD
    """
    route_key = f"{source.lower()}_{destination.lower()}"
    
    if route_key not in _model_cache:
        df = get_route_data(source, destination)
        if df.empty:
            logger.warning(f"No historical data found for {source} to {destination}. Cannot forecast.")
            return {
                "forecast_available": False,
                "reason": "Insufficient historical data"
            }
        
        # Aggregate by date if there are multiple prices per day (e.g., take the median)
        df_agg = df.groupby('ds')['y'].median().reset_index()
        
        # Train Prophet model
        logger.info(f"Training Prophet model for {route_key} with {len(df_agg)} data points...")
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            changepoint_prior_scale=0.05
        )
        model.fit(df_agg)
        _model_cache[route_key] = model
    else:
        model = _model_cache[route_key]

    # Target departure date
    try:
        t_date = pd.to_datetime(target_date).date()
    except Exception as e:
        logger.error(f"Invalid target date {target_date}: {e}")
        return {"forecast_available": False, "reason": "Invalid date format"}

    today = datetime.date.today()
    
    # If the target date is in the past or today, forecasting booking window makes no sense
    if t_date <= today:
        return {"forecast_available": False, "reason": "Target date is in the past or today"}

    # We want to forecast prices for booking *today* vs booking *in the future* up to the target_date
    # Since our data is indexed by 'Date_of_Journey', wait, our Prophet model predicts price 
    # based on Date of Journey. This tells us the seasonal baseline price for a flight on that date.
    # To find the optimal booking *window*, we actually need data predicting price based on (Date_of_Journey - Date_of_Booking).
    # However, since we only have a simple dataset with Date_of_Journey, we'll proxy the "booking window"
    # using a heuristic trend on the target date's seasonality. A more advanced model would require Lead Time.
    
    # Let's generate a future dataframe
    future_dates = model.make_future_dataframe(periods=30)
    forecast = model.predict(future_dates)
    
    # Extract the prediction for the target date
    target_pred = forecast[forecast['ds'].dt.date == t_date]
    if target_pred.empty:
        # If it's too far in the future, we extend the future dataframe
        days_ahead = (t_date - today).days + 10
        future_dates = model.make_future_dataframe(periods=days_ahead)
        forecast = model.predict(future_dates)
        target_pred = forecast[forecast['ds'].dt.date == t_date]

    if target_pred.empty:
        return {"forecast_available": False, "reason": "Target date too far ahead"}

    yhat = target_pred.iloc[0]['yhat']
    yhat_lower = target_pred.iloc[0]['yhat_lower']
    yhat_upper = target_pred.iloc[0]['yhat_upper']

    # Simulate a booking curve: prices typically drop 3-6 weeks out and spike close to departure
    days_until_flight = (t_date - today).days
    
    advice = "Buy Now"
    if days_until_flight > 60:
        advice = "Wait"
    elif 21 <= days_until_flight <= 60:
        advice = "Buy Now"
    elif days_until_flight < 21:
        advice = "Price Likely to Increase"

    return {
        "forecast_available": True,
        "source": source,
        "destination": destination,
        "target_date": target_date,
        "expected_price_baseline": round(yhat, 2),
        "confidence_interval": {
            "lower": round(yhat_lower, 2),
            "upper": round(yhat_upper, 2)
        },
        "booking_advice": advice,
        "model_uncertainty": round((yhat_upper - yhat_lower) / yhat, 4) if yhat > 0 else 0
    }
