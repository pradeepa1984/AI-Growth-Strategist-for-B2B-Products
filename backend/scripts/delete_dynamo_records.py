"""
Delete records from the company_intelligence DynamoDB table.

Usage:
  # Delete all records for a specific URL
  python scripts/delete_dynamo_records.py --url https://inubesolutions.com/

  # Delete ALL records in the table (use with caution)
  python scripts/delete_dynamo_records.py --all
"""

import sys
import argparse
import boto3
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

AWS_PROFILE = "Website-intel-dev"
AWS_REGION  = "us-east-1"
TABLE_NAME  = "company_intelligence"


def get_table():
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    return session.resource("dynamodb").Table(TABLE_NAME)


def delete_by_url(url: str):
    table = get_table()

    response = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("company_url").eq(url)
    )
    items = response.get("Items", [])

    if not items:
        print(f"No records found for: {url}")
        return

    print(f"Found {len(items)} record(s) for: {url}")
    for item in items:
        table.delete_item(Key={
            "company_url": item["company_url"],
            "analysed_at": item["analysed_at"],
        })
        print(f"  Deleted: {item['company_url']} @ {item['analysed_at']}")

    print("Done.")


def delete_all():
    table = get_table()

    response = table.scan(ProjectionExpression="company_url, analysed_at")
    items = response.get("Items", [])

    while "LastEvaluatedKey" in response:
        response = table.scan(
            ProjectionExpression="company_url, analysed_at",
            ExclusiveStartKey=response["LastEvaluatedKey"]
        )
        items.extend(response.get("Items", []))

    if not items:
        print("Table is already empty.")
        return

    confirm = input(f"About to delete ALL {len(items)} records. Type 'yes' to confirm: ")
    if confirm.strip().lower() != "yes":
        print("Aborted.")
        return

    with table.batch_writer() as batch:
        for item in items:
            batch.delete_item(Key={
                "company_url": item["company_url"],
                "analysed_at": item["analysed_at"],
            })

    print(f"Deleted {len(items)} records.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", help="Delete all records for this URL")
    group.add_argument("--all", action="store_true", help="Delete ALL records")
    args = parser.parse_args()

    if args.url:
        delete_by_url(args.url)
    elif args.all:
        delete_all()
