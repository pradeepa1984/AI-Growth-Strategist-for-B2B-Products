"""
Run once to create the leaddiscovery DynamoDB table.

Schema:
  PK  : company_url   (String) — normalized URL of the source company
  SK  : analysed_at   (String) — ISO timestamp of when leads were discovered

Non-key fields (stored as item attributes, no index needed):
  company_name      (String)
  organization_list (List)   — raw Apollo org objects
  lead_list         (List)   — cleaned/deduplicated lead records

Usage:
  python scripts/create_leaddiscovery_table.py
"""

import boto3
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

AWS_PROFILE = "Website-intel-dev"
AWS_REGION  = "us-east-1"
TABLE_NAME  = "leaddiscovery"


def create_table():
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    dynamo  = session.client("dynamodb")

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
        BillingMode="PAY_PER_REQUEST",
    )

    waiter = dynamo.get_waiter("table_exists")
    print("Waiting for table to become active...")
    waiter.wait(TableName=TABLE_NAME)

    print(f"Table '{TABLE_NAME}' created and active.")
    print(f"  PK  : company_url   (String) — source company normalized URL")
    print(f"  SK  : analysed_at   (String) — ISO timestamp")
    print(f"  Attr: company_name  (String)")
    print(f"  Attr: organization_list (List)")
    print(f"  Attr: lead_list     (List)")
    print(f"  Billing: PAY_PER_REQUEST")


if __name__ == "__main__":
    create_table()
