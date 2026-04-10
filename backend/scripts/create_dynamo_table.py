"""
Run once to create the company_intelligence DynamoDB table.
Usage: python scripts/create_dynamo_table.py
"""

import boto3
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

AWS_PROFILE  = "Website-intel-dev"
AWS_REGION   = "us-east-1"
TABLE_NAME   = "company_intelligence"


def create_table():
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    dynamo  = session.client("dynamodb")

    # Check if table already exists
    existing = dynamo.list_tables()["TableNames"]
    if TABLE_NAME in existing:
        print(f"Table '{TABLE_NAME}' already exists — nothing to do.")
        return

    print(f"Creating table '{TABLE_NAME}'...")

    dynamo.create_table(
        TableName=TABLE_NAME,
        KeySchema=[
            {"AttributeName": "company_url",  "KeyType": "HASH"},   # Partition key
            {"AttributeName": "analysed_at",  "KeyType": "RANGE"},  # Sort key
        ],
        AttributeDefinitions=[
            {"AttributeName": "company_url",  "AttributeType": "S"},
            {"AttributeName": "analysed_at",  "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",  # On-demand — no capacity planning needed
    )

    # Wait until table is active
    waiter = dynamo.get_waiter("table_exists")
    print("Waiting for table to become active...")
    waiter.wait(TableName=TABLE_NAME)

    print(f"Table '{TABLE_NAME}' created and active.")
    print(f"  PK : company_url (String)")
    print(f"  SK : analysed_at (String)")
    print(f"  Billing: PAY_PER_REQUEST")


if __name__ == "__main__":
    create_table()
