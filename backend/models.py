from pydantic import BaseModel, Field


class EmergencyOrderBatch(BaseModel):
    orders: list["EmergencyOrder"]


class EmergencyOrder(BaseModel):
    order_number: str = Field(..., description="Unique SO identifier, e.g. 'EMG-001'")
    finished_goods_part: str = Field(..., description="Finished goods part number")
    order_quantity: int = Field(..., gt=0)
    order_date: str = Field(..., description="YYYY-MM-DD")
    shipping_date: str = Field(..., description="YYYY-MM-DD — required delivery deadline")
    department: str = Field(..., description="'Production Section 1' or 'Production Section 2'")
    standard_seconds: float = Field(..., gt=0, description="Seconds of labor per unit")
    effective_lt: int = Field(
        0, ge=0,
        description="Material lead time in calendar days. A minimum of 3 days is enforced.",
    )
