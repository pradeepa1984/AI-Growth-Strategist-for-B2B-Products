"""
Bootstrap script — creates the market_intelligence and content_generation DynamoDB tables.

Run once after the main company_intelligence table is already set up:
    python scripts/create_additional_tables.py

Tables created:
  market_intelligence  : PK=company_url (S), SK=analysed_at (S)
  content_generation   : PK=company_url (S), SK=sk (S)  where sk = topic_slug#generated_at
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import boto3
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

import os

AWS_PROFILE = "Website-intel-dev"
AWS_REGION  = os.environ.get("AWS_REGION", "us-east-1")

TABLES = [
    {
        "TableName": "market_intelligence",
        "KeySchema": [
            {"AttributeName": "company_url", "KeyType": "HASH"},
            {"AttributeName": "analysed_at", "KeyType": "RANGE"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "company_url", "AttributeType": "S"},
            {"AttributeName": "analysed_at", "AttributeType": "S"},
        ],
    },
    {
        "TableName": "content_generation",
        "KeySchema": [
            {"AttributeName": "company_url", "KeyType": "HASH"},
            {"AttributeName": "sk",          "KeyType": "RANGE"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "company_url", "AttributeType": "S"},
            {"AttributeName": "sk",          "AttributeType": "S"},
        ],
    },
]


def create_tables():
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    dynamo  = session.client("dynamodb")

    for table_def in TABLES:
        name = table_def["TableName"]
        try:
            dynamo.create_table(
                TableName=name,
                KeySchema=table_def["KeySchema"],
                AttributeDefinitions=table_def["AttributeDefinitions"],
                BillingMode="PAY_PER_REQUEST",
            )
            print(f"Created table: {name}")
        except dynamo.exceptions.ResourceInUseException:
            print(f"Table already exists (skipped): {name}")
        except Exception as e:
            print(f"Error creating {name}: {e}")


if __name__ == "__main__":
    create_tables()
    print("Done.")
